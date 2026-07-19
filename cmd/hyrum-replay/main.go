// Command hyrum-replay runs a deterministic corpus against base and candidate HTTP targets.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/hyrum-dev/hyrum/internal/buildinfo"
	"github.com/hyrum-dev/hyrum/internal/replay"
	"github.com/hyrum-dev/hyrum/internal/report"
)

func main() {
	err := run(context.Background(), os.Args[1:], os.Stdout, os.Getenv)
	if err == nil {
		return
	}
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func run(ctx context.Context, args []string, stdout io.Writer, getenv func(string) string) error {
	flags := flag.NewFlagSet("hyrum-replay", flag.ContinueOnError)
	flags.SetOutput(stdout)
	version := flags.Bool("version", false, "print version information")
	configPath := flags.String("config", "", "strict replay config JSON path")
	outputPath := flags.String("output", "-", "signed report path, or - for stdout")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if *version {
		return json.NewEncoder(stdout).Encode(buildinfo.Current("hyrum-replay"))
	}
	key := []byte(getenv("HYRUM_REPORT_SIGNING_KEY"))
	if *configPath == "" || len(key) < 32 {
		return errors.New("-config and HYRUM_REPORT_SIGNING_KEY (at least 32 bytes) are required")
	}
	file, err := os.Open(*configPath)
	if err != nil {
		return err
	}
	config, err := replay.DecodeConfig(file)
	_ = file.Close()
	if err != nil {
		return err
	}
	config, cleanup, err := replay.StartDockerIsolation(ctx, config, replay.ExecDocker{})
	if err != nil {
		return err
	}
	defer cleanup()
	value, err := (replay.Runner{}).Run(ctx, config)
	if err != nil {
		return err
	}
	if err := report.Sign(&value, config.SigningKeyID, key); err != nil {
		return err
	}
	output := stdout
	var closeOutput func() error
	if *outputPath != "-" {
		outputFile, err := os.Create(*outputPath)
		if err != nil {
			return err
		}
		output = outputFile
		closeOutput = outputFile.Close
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return err
	}
	if closeOutput != nil {
		if err := closeOutput(); err != nil {
			return err
		}
	}
	return nil
}
