// Command hyrum-agent converts strict capture NDJSON into redacted, tenant-scoped evidence records.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/hyrum-dev/hyrum/internal/buildinfo"
	"github.com/hyrum-dev/hyrum/internal/capture"
)

type stringsFlag []string

func (values *stringsFlag) String() string { return fmt.Sprint([]string(*values)) }
func (values *stringsFlag) Set(value string) error {
	*values = append(*values, value)
	return nil
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout io.Writer, getenv func(string) string) error {
	flags := flag.NewFlagSet("hyrum-agent", flag.ContinueOnError)
	flags.SetOutput(stdout)
	version := flags.Bool("version", false, "print version information")
	organizationID := flags.String("organization-id", "", "organization that owns every input event")
	inputPath := flags.String("input", "-", "capture NDJSON path, or - for stdin")
	outputPath := flags.String("output", "-", "redacted NDJSON path, or - for stdout")
	var sensitivePaths, maskPaths, operationTemplates stringsFlag
	flags.Var(&sensitivePaths, "sensitive-path", "exact JSON path to redact; repeatable")
	flags.Var(&maskPaths, "mask-path", "nondeterministic response path to mask; repeatable")
	flags.Var(&operationTemplates, "operation-template", "allowed METHOD /path/{parameter} template; repeatable")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if *version {
		return json.NewEncoder(stdout).Encode(buildinfo.Current("hyrum-agent"))
	}
	key := []byte(getenv("HYRUM_MASTER_KEY"))
	if *organizationID == "" || len(key) < 32 {
		return errors.New("-organization-id and HYRUM_MASTER_KEY (at least 32 bytes) are required")
	}
	input, closeInput, err := openInput(*inputPath, stdin)
	if err != nil {
		return err
	}
	defer closeInput()
	events, err := capture.DecodeNDJSON(input)
	if err != nil {
		return err
	}
	records, err := capture.Process(events, capture.Config{
		OrganizationID: *organizationID, MasterKey: key, OperationTemplates: operationTemplates,
		SensitivePaths: sensitivePaths, MaskPaths: maskPaths,
	})
	if err != nil {
		return err
	}
	output, closeOutput, err := openOutput(*outputPath, stdout)
	if err != nil {
		return err
	}
	defer closeOutput()
	return capture.EncodeNDJSON(output, records)
}

func openInput(path string, fallback io.Reader) (io.Reader, func(), error) {
	if path == "-" {
		return fallback, func() {}, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, func() {}, err
	}
	return file, func() { _ = file.Close() }, nil
}

func openOutput(path string, fallback io.Writer) (io.Writer, func(), error) {
	if path == "-" {
		return fallback, func() {}, nil
	}
	file, err := os.Create(path)
	if err != nil {
		return nil, func() {}, err
	}
	return file, func() { _ = file.Close() }, nil
}
