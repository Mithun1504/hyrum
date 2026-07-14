package buildinfo

import "runtime"

var (
	version = "dev"
	commit  = "unknown"
)

type Info struct {
	Command string `json:"command"`
	Version string `json:"version"`
	Commit  string `json:"commit"`
	Go      string `json:"go"`
}

func Current(command string) Info {
	return Info{Command: command, Version: version, Commit: commit, Go: runtime.Version()}
}
