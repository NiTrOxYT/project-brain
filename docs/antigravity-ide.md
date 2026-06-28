# Antigravity IDE Integration

Project Brain supports integration with Antigravity IDE as a first-class Model Context Protocol (MCP) server.

## Installation

To automatically install and configure the Brain MCP server for Antigravity IDE, run:

```bash
brain install antigravity
```

This command will:
1. Detect your Antigravity installation automatically (looks for `~/.gemini/config/` or `~/.gemini/antigravity-ide/`).
2. Create a backup of your existing configuration file.
3. Merge the Project Brain MCP server configuration cleanly into `~/.gemini/config/mcp_config.json`.
4. Validate the resulting configuration format.

The installation is fully idempotent. Running the command multiple times will not duplicate configuration entries.

## Verification

To verify that the installation succeeded and the MCP server is working correctly, run the doctor command:

```bash
brain doctor
```

Under the Antigravity section, you should see:
- `✓ Installed`
- `✓ Configuration Valid`
- `✓ MCP Reachable`
- `✓ brain.get_context`
- `✓ brain.search_memory`

## Manual Verification

You can inspect the configuration file at `~/.gemini/config/mcp_config.json`. It should contain the following entry:

```json
{
  "mcpServers": {
    "brain": {
      "command": "brain",
      "args": ["mcp", "stdio"]
    }
  }
}
```

Unrelated MCP servers under the `mcpServers` object are fully preserved during install and uninstall operations.

## Troubleshooting

### Missing Configuration Directories
If `brain install` reports that Antigravity was not found, ensure that you have run the Antigravity IDE or CLI at least once to initialize its config paths under `~/.gemini/`.

### Validation Failures
If the configuration file is malformed, the installation will automatically back up and attempt to recover the structure by re-initializing a valid JSON configuration containing the `brain` server entry.
