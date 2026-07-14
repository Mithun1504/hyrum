// Command hyrum-agent is the customer-side capture process.
//
// The scaffold exposes only lifecycle and version behavior. Capture adapters,
// session sampling, and deterministic extraction are intentionally deferred.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/hyrum-dev/hyrum/internal/buildinfo"
)

func main() {
	version := flag.Bool("version", false, "print version information")
	flag.Parse()

	if *version {
		if err := json.NewEncoder(os.Stdout).Encode(buildinfo.Current("hyrum-agent")); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	fmt.Fprintln(os.Stdout, "hyrum-agent foundation is ready; no capture adapter is configured")
}
