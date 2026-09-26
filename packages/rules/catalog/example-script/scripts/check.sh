#!/bin/sh
# The contract a rule's script follows: the changed files the rule applies to
# arrive as arguments, each candidate goes to stdout as `file:line: message`,
# and it exits 0 whether it found anything or not.
#
# This one is an example and asks for nothing, so it prints nothing.
for file in "$@"; do
	: "$file"
done
exit 0
