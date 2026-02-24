# Deep Context

Your AI keeps forgetting what you told it. Deep Context fixes that.

## The problem

Monday: "Use tabs, not spaces"
Tuesday: "I said tabs!"
Wednesday: "WHY ARE THERE SPACES"

Sound familiar? Every new chat starts from zero. Your AI has no memory.

## What this does

Deep Context gives AI tools memory. You tell it something once, it remembers forever.

## Install

```
npm install -g @jondavis23/deep-context
```

## Setup

```
cd your-project
dc init
dc install
```

`dc init` detects your stack and sets up rules. `dc install` connects it to your AI tools (Claude Code, Cursor, Claude Desktop).

After that, your rules and preferences are automatically included in every AI conversation for that project.

You can add your own rules too:

```
dc add rule "Always use async/await, never callbacks"
dc add rule "All IDs must be UUIDs"
dc add choice "PostgreSQL" --why "Need complex queries"
```

## How it works

Each project gets a `.dc` folder with:
- Your rules (things the AI should always do)
- Your choices (decisions you made and why)
- Memories (things the AI learned while working with you)

When an AI tool asks for context, Deep Context gives it the relevant stuff. The AI writes better code because it knows your preferences.

## Commands

```
dc init              # set up a project
dc install           # connect to Claude Code, Cursor, etc.
dc status            # see what's connected
dc add rule "..."    # add a rule
dc add choice "..."  # record a decision
dc disable           # turn off for this project
dc enable            # turn back on
dc remove            # delete everything
```

## Does it actually work?

We ran a benchmark with 10 coding tasks. Without Deep Context, Claude followed project conventions 33% of the time. With Deep Context, 91%.

That's the difference between "use UUIDs" being ignored vs being followed.

## Privacy

Everything stays on your machine in the `.dc` folder. Nothing is sent anywhere unless you're using a cloud AI (and even then, only the context goes to the AI you chose).

## Requirements

- Node 20+
- For the MCP server: Claude Code, Cursor, or Claude Desktop

## Questions

**Do I need to configure anything?**
Run `dc init` then `dc install`. It auto-detects your project type and connects to your AI tools.

**What if I have 50 projects?**
Each project has its own `.dc` folder. No bleeding between projects.

**Can I turn it off for a project?**
`dc disable` creates a `.dcignore` file. The AI tools will skip that project.

**Is it free?**
Yes. MIT license.

---

MIT License
