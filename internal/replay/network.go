package replay

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sort"
	"strings"
	"time"
)

type IPResolver interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

type dialContextFunc func(context.Context, string, string) (net.Conn, error)

type networkPolicy struct {
	allowed  map[string]struct{}
	pinned   map[string]map[netip.Addr]struct{}
	resolver IPResolver
	dial     dialContextFunc
}

var metadataHosts = map[string]struct{}{
	"metadata": {}, "metadata.google.internal": {}, "metadata.aws.internal": {},
}

var metadataAddresses = []netip.Prefix{
	netip.MustParsePrefix("169.254.169.254/32"),
	netip.MustParsePrefix("169.254.170.2/32"),
	netip.MustParsePrefix("fd00:ec2::254/128"),
}

func newNetworkPolicy(ctx context.Context, config Config, resolver IPResolver, dial dialContextFunc) (*networkPolicy, error) {
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	if dial == nil {
		dialer := &net.Dialer{Timeout: time.Duration(config.TimeoutMS) * time.Millisecond}
		dial = dialer.DialContext
	}
	policy := &networkPolicy{allowed: normalizedHosts(config.AllowedHosts), pinned: map[string]map[netip.Addr]struct{}{}, resolver: resolver, dial: dial}
	for _, raw := range []string{config.BaseURL, config.CandidateURL} {
		target, _ := url.Parse(raw)
		host := normalizeHost(target.Hostname())
		if _, exists := policy.pinned[host]; exists {
			continue
		}
		addresses, err := policy.resolve(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("resolve approved target %q: %w", host, err)
		}
		policy.pinned[host] = addresses
	}
	return policy, nil
}

func (policy *networkPolicy) dialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("invalid dial address: %w", err)
	}
	host = normalizeHost(host)
	if _, ok := policy.allowed[host]; !ok {
		return nil, fmt.Errorf("dial target %q is not allowlisted", host)
	}
	pinned, ok := policy.pinned[host]
	if !ok {
		return nil, fmt.Errorf("dial target %q was not resolved during preflight", host)
	}
	current, err := policy.resolve(ctx, host)
	if err != nil {
		return nil, err
	}
	if !sameAddresses(pinned, current) {
		return nil, fmt.Errorf("DNS answers for %q changed after preflight", host)
	}
	addresses := make([]string, 0, len(current))
	for address := range current {
		addresses = append(addresses, address.String())
	}
	sort.Strings(addresses)
	var dialErrors []error
	for _, ip := range addresses {
		connection, dialErr := policy.dial(ctx, network, net.JoinHostPort(ip, port))
		if dialErr == nil {
			return connection, nil
		}
		dialErrors = append(dialErrors, dialErr)
	}
	return nil, errors.Join(dialErrors...)
}

func (policy *networkPolicy) resolve(parent context.Context, host string) (map[netip.Addr]struct{}, error) {
	if isMetadataHost(host) {
		return nil, errors.New("metadata host is forbidden")
	}
	if literal, err := netip.ParseAddr(host); err == nil {
		literal = literal.Unmap()
		if err := validateResolvedAddress(literal); err != nil {
			return nil, err
		}
		return map[netip.Addr]struct{}{literal: {}}, nil
	}
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	resolved, err := policy.resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	addresses := make(map[netip.Addr]struct{}, len(resolved))
	for _, item := range resolved {
		address, ok := netip.AddrFromSlice(item.IP)
		if !ok {
			return nil, errors.New("resolver returned an invalid IP address")
		}
		address = address.Unmap()
		if err := validateResolvedAddress(address); err != nil {
			return nil, fmt.Errorf("resolved %s: %w", address, err)
		}
		addresses[address] = struct{}{}
	}
	if len(addresses) == 0 {
		return nil, errors.New("resolver returned no addresses")
	}
	return addresses, nil
}

func securedHTTPClient(base *http.Client, policy *networkPolicy) (*http.Client, error) {
	if base == nil {
		base = &http.Client{}
	}
	client := *base
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if base.Transport != nil {
		configured, ok := base.Transport.(*http.Transport)
		if !ok {
			return nil, errors.New("custom replay client transport must be *http.Transport")
		}
		transport = configured.Clone()
	}
	transport.Proxy = nil
	transport.DialContext = policy.dialContext
	transport.DialTLSContext = nil
	client.Transport = transport
	client.Jar = nil
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	return &client, nil
}

func validateResolvedAddress(address netip.Addr) error {
	if !address.IsValid() || address.IsUnspecified() || address.IsMulticast() {
		return errors.New("unspecified and multicast addresses are forbidden")
	}
	if address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() {
		return errors.New("link-local addresses are forbidden")
	}
	for _, prefix := range metadataAddresses {
		if prefix.Contains(address) {
			return errors.New("metadata address is forbidden")
		}
	}
	return nil
}

func normalizedHosts(hosts []string) map[string]struct{} {
	result := make(map[string]struct{}, len(hosts))
	for _, host := range hosts {
		result[normalizeHost(host)] = struct{}{}
	}
	return result
}

func normalizeHost(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}

func isMetadataHost(host string) bool {
	_, found := metadataHosts[normalizeHost(host)]
	return found
}

func sameAddresses(left, right map[netip.Addr]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for address := range left {
		if _, ok := right[address]; !ok {
			return false
		}
	}
	return true
}
