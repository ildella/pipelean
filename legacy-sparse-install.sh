#!/bin/bash
# Helper script to install pipelean skills into the current project
mkdir -p ~/.agents/skills/pipelean-core ~/.agents/skills/pipelean-fp-standards
mkdir -p ~/.claude/skills/pipelean-core ~/.claude/skills/pipelean-fp-standards
ln -sf "$(pwd)"/skills/core/SKILL.md ~/.agents/skills/pipelean-core/SKILL.md
ln -sf "$(pwd)"/skills/core/SKILL.md ~/.claude/skills/pipelean-core/SKILL.md
ln -sf "$(pwd)"/skills/fp-standards/SKILL.md ~/.agents/skills/pipelean-fp-standards/SKILL.md
ln -sf "$(pwd)"/skills/fp-standards/SKILL.md ~/.claude/skills/pipelean-fp-standards/SKILL.md
echo "Pipelean skills symlinked to .agents/skills/"
