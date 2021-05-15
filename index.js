import { promises as fs } from "fs";
import { compile } from "./src/compiler.js";
import path from "path";

const __dirname = path.resolve();


;(async () => {

    const compiled = await compile(await fs.readFile("./tests/test.html", "utf8"));

    await fs.writeFile(path.resolve(__dirname, "./dist/index.html"), compiled);

})();