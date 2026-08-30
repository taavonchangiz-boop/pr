// Detached launcher: spawns dev server fully reparented to init.
import { spawn } from "bun";

const f = Bun.openSync("/home/z/my-project/dev.log", { flags: "a", mode: 0o644 });
const nul = Bun.openSync("/dev/null", { flags: "r" });

const proc = spawn(["bun", "run", "dev"], {
  cwd: "/home/z/my-project",
  detached: true,
  stdin: nul,
  stdout: f,
  stderr: f,
});
proc.unref();
console.log("launched dev server PID:", proc.pid);
