# Provenance

This `video-perception` skill was vendored from the third-party Claude Code plugin
**claude-video-vision** by Jordan Vasconcelos.

- Source: https://github.com/jordanrendric/claude-video-vision
- Plugin version at time of vendoring: 1.2.0
- License: MIT

## Important: this is the skill layer only

The skill contains the *instructions* for analyzing video. The actual tools it
references (`video_info`, `video_analyze`, `video_watch`, `video_detail`,
`video_configure`, `video_setup`) are provided by the plugin's **MCP server**,
which is NOT included by this skill-only install. Until that MCP server is
available, this skill will describe a workflow whose tools don't yet exist.

To make video perception fully functional, add the MCP server one of two ways:

1. Install the full plugin in your own Claude Code client (persists on your machine):

   ```
   /plugin marketplace add https://github.com/jordanrendric/claude-video-vision
   /plugin install claude-video-vision
   ```

2. Or register the MCP server for this repo by adding a `.mcp.json` at the repo root:

   ```json
   {
     "mcpServers": {
       "claude-video-vision": {
         "command": "npx",
         "args": ["-y", "claude-video-vision@latest"]
       }
     }
   }
   ```

The server also requires `ffmpeg` (and `yt-dlp` for YouTube URLs) on the host,
plus a transcription backend (Gemini API, OpenAI API, or local Whisper).
