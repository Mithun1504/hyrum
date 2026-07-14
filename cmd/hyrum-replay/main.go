// Command hyrum-replay is the CI-side differential replay runner.
//
// The scaffold exposes only lifecycle and version behavior. Container
// orchestration and behavior comparison are intentionally deferred.
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
		if err := json.NewEncoder(os.Stdout).Encode(buildinfo.Current("hyrum-replay")); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	fmt.Fprintln(os.Stdout, "hyrum-replay foundation is ready; no replay plan is configured")
}
