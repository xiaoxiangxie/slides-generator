const { callClaude } = require("./lib/pipeline/claude-runner");

async function main() {
  console.log("Testing callClaude...");
  const result = await callClaude("Please reply with ONLY the word SUCCESS.", { timeout: 10000 });
  console.log("Result:", result);
}
main();
