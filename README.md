<div align="center">

# 🧠 Project Brain

### Semantic Context Engine for AI Coding Agents

Compile your codebase into a semantic knowledge graph that AI assistants can query instantly using MCP instead of repeatedly exploring your repository.

---

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![MCP](https://img.shields.io/badge/MCP-Compatible-purple)
![License](https://img.shields.io/github/license/NiTrOxYT/project-brain)
![Tests](https://img.shields.io/github/actions/workflow/status/USERNAME/project-brain/test.yml)

[Documentation](#documentation) •
[Quick Start](#quick-start) •
[Features](#features) •
[Architecture](#architecture) •
[Roadmap](#roadmap)

</div>

---

# What is Project Brain?

Project Brain is a **semantic context compiler** for software projects.

Instead of forcing AI assistants to repeatedly:

- browse folders
- grep the repository
- inspect dozens of files
- rebuild project understanding every conversation

Project Brain compiles your repository into a semantic index that AI agents can retrieve instantly through the **Model Context Protocol (MCP).**

Think of it as:

> **Language Server + Semantic Search + AI Memory + MCP Server**

for your codebase.

---

# Why?

Current AI IDEs waste thousands of tokens every session.

Typical workflow:

```
User Question
      ↓
AI lists folders
      ↓
Reads files
      ↓
Greps repository
      ↓
Builds context
      ↓
Finally answers
```

Project Brain changes the workflow:

```
User Question
      ↓
Brain MCP
      ↓
Semantic Retrieval
      ↓
Answer
```

No repository exploration.

No wasted tokens.

Much faster responses.

---

# Features

✅ Semantic indexing

✅ Dependency graph generation

✅ Symbol analysis

✅ Architecture extraction

✅ Semantic memory

✅ Context retrieval

✅ MCP server

✅ Automatic workspace instructions

✅ AI IDE integration

---

# Supported AI IDEs

| IDE | Status |
|------|--------|
| Antigravity IDE | ✅ |
| OpenCode | ✅ |
| Claude Code | ✅ |
| Continue | ✅ |
| Cursor | 🚧 |
| VS Code MCP | 🚧 |

---

# Installation

```bash
npm install -g project-brain
```

or

```bash
git clone https://github.com/YOUR_USERNAME/project-brain

cd project-brain

npm install

npm run build
```

---

# Quick Start

## 1. Initialize Brain

Inside your project:

```bash
brain init
```

Creates:

```
.brain/
```

including the automatically generated

```
.brain/SKILL.md
```

used by AI IDEs.

---

## 2. Compile Context

```bash
brain compile
```

Brain analyzes:

- files
- imports
- exports
- symbols
- architecture
- dependencies
- semantic relationships

and generates the workspace index.

---

## 3. Install into your AI IDE

Example:

```bash
brain install antigravity
```

or

```bash
brain install opencode
```

Brain automatically configures the MCP server.

---

## 4. Start Coding

Your AI can now retrieve repository knowledge using Brain instead of repeatedly reading your code.

---

# MCP Tools

Project Brain exposes high-level semantic tools.

| Tool | Purpose |
|------|----------|
| get_context | Answer repository questions |
| get_architecture | Explain the project architecture |
| explain_file | Explain a file without reading it |
| find_symbol | Find symbol usage |
| find_dependencies | Dependency analysis |
| search_memory | Semantic memory search |

---

# Example

Instead of asking your AI:

> "Read my project."

Ask:

> Explain the architecture.

The AI calls:

```
brain.get_architecture
```

instead of scanning hundreds of files.

---

# AI Workflow

Project Brain teaches AI assistants to follow this workflow:

```
User Question
      │
      ▼
Brain MCP
      │
      ▼
Semantic Context
      │
      ▼
Need implementation?
      │
      ├── No → Answer immediately
      │
      └── Yes
             │
             ▼
Read only the relevant files
```

---

# Architecture

```
Repository
     │
     ▼
brain compile
     │
     ▼
Semantic Index
     │
     ▼
MCP Server
     │
     ▼
AI IDE
```

---

# Repository Structure

```
packages/
    ai-gateway/
    cli/
    compiler/
    context-retrieval/
    dependency/
    filesystem/
    mcp-server/
    provider-bridge/
    runtime/
    workspace/
```

---

# Commands

Initialize

```bash
brain init
```

Compile

```bash
brain compile
```

Install

```bash
brain install antigravity
```

Inspect

```bash
brain inspect
```

Doctor

```bash
brain doctor
```

Stats

```bash
brain stats
```

---

# Roadmap

- [x] Context compiler
- [x] MCP server
- [x] Semantic retrieval
- [x] Dependency graph
- [x] Automatic SKILL.md
- [x] Antigravity integration
- [ ] VS Code extension
- [ ] Cursor integration
- [ ] Incremental indexing
- [ ] Remote semantic index
- [ ] Team knowledge sharing

---

# Contributing

Contributions are welcome.

Please open an issue before submitting major changes.

---

# License

MIT

---

<div align="center">

Built with ❤️ for AI-assisted software development.

</div>
