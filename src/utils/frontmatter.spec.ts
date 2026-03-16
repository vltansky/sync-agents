import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  reconstructMarkdown,
  transformForOpenCode,
  transformContentForClient,
} from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("returns null frontmatter for content without frontmatter", () => {
    const content = "# Hello\n\nNo frontmatter here.";
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it("parses simple key-value frontmatter", () => {
    const content = `---
name: test-agent
description: A test agent
---

# Content`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({
      name: "test-agent",
      description: "A test agent",
    });
    expect(result.body).toBe("\n# Content");
  });

  it("parses boolean values", () => {
    const content = `---
enabled: true
disabled: false
---
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.enabled).toBe(true);
    expect(result.frontmatter?.disabled).toBe(false);
  });

  it("parses numeric values", () => {
    const content = `---
count: 42
ratio: 3.14
---
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.count).toBe(42);
    expect(result.frontmatter?.ratio).toBe(3.14);
  });
});

describe("reconstructMarkdown", () => {
  it("creates valid frontmatter markdown", () => {
    const frontmatter = { name: "test", enabled: true };
    const body = "\n# Content";
    const result = reconstructMarkdown(frontmatter, body);
    expect(result).toBe(`---
name: test
enabled: true
---

# Content`);
  });

  it("handles object values", () => {
    const frontmatter = { tools: { Read: true, Edit: false } };
    const body = "";
    const result = reconstructMarkdown(frontmatter, body);
    expect(result).toContain("tools:");
    expect(result).toContain("  Read: true");
    expect(result).toContain("  Edit: false");
  });

  it("handles array values", () => {
    const frontmatter = { items: ["one", "two", "three"] };
    const body = "";
    const result = reconstructMarkdown(frontmatter, body);
    expect(result).toContain("items:");
    expect(result).toContain("  - one");
    expect(result).toContain("  - two");
    expect(result).toContain("  - three");
  });
});

describe("transformForOpenCode", () => {
  it("transforms comma-separated tools string to object", () => {
    const content = `---
name: test
tools: Read, Edit, Bash
---

# Content`;
    const result = transformForOpenCode(content);
    expect(result).toContain("tools:");
    expect(result).toContain("  Read: true");
    expect(result).toContain("  Edit: true");
    expect(result).toContain("  Bash: true");
    expect(result).not.toContain("Read, Edit, Bash");
  });

  it("transforms color name to hex", () => {
    const content = `---
name: test
color: purple
---

# Content`;
    const result = transformForOpenCode(content);
    expect(result).toContain('color: "#9B59B6"');
    expect(result).not.toContain("color: purple");
  });

  it("leaves already-hex colors unchanged", () => {
    const content = `---
name: test
color: "#FF5733"
---

# Content`;
    const result = transformForOpenCode(content);
    expect(result).toContain('color: "#FF5733"');
  });

  it("preserves content without frontmatter", () => {
    const content = "# No frontmatter\n\nJust content.";
    const result = transformForOpenCode(content);
    expect(result).toBe(content);
  });

  it("handles missing tools field gracefully", () => {
    const content = `---
name: test
---

# Content`;
    const result = transformForOpenCode(content);
    expect(result).toContain("name: test");
    expect(result).not.toContain("tools:");
  });

  it("preserves body content after transformation", () => {
    const content = `---
name: test
tools: Read
---

# Big Content

This is a lot of text that should be preserved.

## Section 2

More content here.`;
    const result = transformForOpenCode(content);
    expect(result).toContain("# Big Content");
    expect(result).toContain("This is a lot of text that should be preserved.");
    expect(result).toContain("## Section 2");
  });
});

describe("transformContentForClient", () => {
  it("transforms agents for opencode", () => {
    const content = `---
tools: Read, Edit
---

# Agent`;
    const result = transformContentForClient(content, "opencode", "agents");
    expect(result).toContain("  Read: true");
    expect(result).toContain("  Edit: true");
  });

  it("does not transform agents for other clients", () => {
    const content = `---
tools: Read, Edit
---

# Agent`;
    const result = transformContentForClient(content, "cursor", "agents");
    expect(result).toBe(content);
  });

  it("does not transform non-agent assets for opencode", () => {
    const content = `---
tools: Read, Edit
---

# Command`;
    const result = transformContentForClient(content, "opencode", "skills");
    expect(result).toBe(content);
  });

  describe("skill frontmatter stripping", () => {
    it("strips Cursor-specific keys when syncing skills to Claude", () => {
      const content = `---
description: Test command
argument-hint: [plan]
model: opus
---

# Test Command`;
      const result = transformContentForClient(content, "claude", "skills");
      expect(result).toContain("description: Test command");
      expect(result).not.toContain("argument-hint");
      expect(result).not.toContain("model:");
      expect(result).toContain("# Test Command");
    });

    it("strips Cursor-specific keys when syncing commands to Codex", () => {
      const content = `---
description: Test
argument-hint: [file]
---

# Test`;
      const result = transformContentForClient(content, "codex", "skills");
      expect(result).toContain("description: Test");
      expect(result).not.toContain("argument-hint");
    });

    it("preserves Cursor-specific keys when syncing to Cursor", () => {
      const content = `---
description: Test
argument-hint: [plan]
model: opus
---

# Test`;
      const result = transformContentForClient(content, "cursor", "skills");
      expect(result).toBe(content);
    });

    it("preserves Cursor-specific keys when syncing to OpenCode", () => {
      const content = `---
description: Test
argument-hint: [plan]
model: opus
---

# Test`;
      const result = transformContentForClient(content, "opencode", "skills");
      expect(result).toBe(content);
    });

    it("strips Claude-specific keys when syncing commands to Cursor", () => {
      const content = `---
description: Test
allowed_tools: read,write
---

# Test`;
      const result = transformContentForClient(content, "cursor", "skills");
      expect(result).toContain("description: Test");
      expect(result).not.toContain("allowed_tools");
    });

    it("preserves body content after stripping", () => {
      const content = `---
description: Big command
argument-hint: [plan]
model: opus
---

# Main Title

## Section 1

Content here.

## Section 2

More content.`;
      const result = transformContentForClient(content, "claude", "skills");
      expect(result).toContain("# Main Title");
      expect(result).toContain("## Section 1");
      expect(result).toContain("Content here.");
      expect(result).toContain("## Section 2");
    });

    it("handles commands without frontmatter", () => {
      const content = `# No frontmatter

Just a command.`;
      const result = transformContentForClient(content, "claude", "skills");
      expect(result).toBe(content);
    });
  });

  describe("MCP transforms", () => {
    const canonicalMcp = JSON.stringify(
      {
        mcpServers: {
          context7: { command: "npx", args: ["-y", "context7-mcp"] },
          octocode: { command: "npx", args: ["-y", "octocode-mcp"] },
        },
      },
      null,
      2,
    );

    it("merges MCP into existing Codex config.toml without clobbering", () => {
      const existingToml = [
        'model = "gpt-5"',
        'sandbox_mode = "danger-full-access"',
        "",
        '[projects."/home/user/repo"]',
        'trust_level = "trusted"',
        "",
        "[mcp_servers.old-server]",
        'command = "old"',
      ].join("\n");

      const result = transformContentForClient(
        canonicalMcp,
        "codex",
        "mcp",
        existingToml,
      );

      // Preserved existing settings
      expect(result).toContain('model = "gpt-5"');
      expect(result).toContain('sandbox_mode = "danger-full-access"');
      expect(result).toContain('trust_level = "trusted"');
      // Replaced MCP sections
      expect(result).toContain("[mcp_servers.context7]");
      expect(result).toContain("[mcp_servers.octocode]");
      // Old MCP section removed
      expect(result).not.toContain("[mcp_servers.old-server]");
      // No JSON in output
      expect(result).not.toContain("mcpServers");
    });

    it("merges MCP into existing Claude .claude.json without clobbering", () => {
      const existingJson = JSON.stringify(
        {
          numStartups: 100,
          installMethod: "native",
          mcpServers: { "old-server": { command: "old" } },
        },
        null,
        2,
      );

      const result = transformContentForClient(
        canonicalMcp,
        "claude",
        "mcp",
        existingJson,
      );

      const parsed = JSON.parse(result);
      expect(parsed.numStartups).toBe(100);
      expect(parsed.installMethod).toBe("native");
      expect(parsed.mcpServers.context7).toBeDefined();
      expect(parsed.mcpServers.octocode).toBeDefined();
    });

    it("merges MCP into existing OpenCode opencode.json without clobbering", () => {
      const existingJson = JSON.stringify(
        { theme: "dark", mcp: { "old-server": { type: "local" } } },
        null,
        2,
      );

      const result = transformContentForClient(
        canonicalMcp,
        "opencode",
        "mcp",
        existingJson,
      );

      const parsed = JSON.parse(result);
      expect(parsed.theme).toBe("dark");
      expect(parsed.mcp.context7).toBeDefined();
      expect(parsed.mcp.context7.type).toBe("local");
    });

    it("handles bare server map (no mcpServers wrapper)", () => {
      const bareMcp = JSON.stringify(
        {
          server1: { command: "npx", args: ["-y", "server1-mcp"] },
        },
        null,
        2,
      );

      const existingToml = 'model = "gpt-5"\n';
      const result = transformContentForClient(
        bareMcp,
        "codex",
        "mcp",
        existingToml,
      );

      expect(result).toContain('model = "gpt-5"');
      expect(result).toContain("[mcp_servers.server1]");
    });

    it("creates Codex TOML from scratch when no existing file", () => {
      const result = transformContentForClient(canonicalMcp, "codex", "mcp");

      expect(result).toContain("[mcp_servers.context7]");
      expect(result).toContain("[mcp_servers.octocode]");
      expect(result).not.toContain("mcpServers");
    });
  });
});
