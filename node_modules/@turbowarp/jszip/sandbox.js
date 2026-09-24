"use strict";

const fs = require("node:fs");
const JSZip = require("./lib/index");

const run = async () => {
    const data = fs.readFileSync("/home/thomas/Downloads/Scratch Project.sb6.sb3");
    const zip = await JSZip.loadAsync(data, {
        recoverCorrupted: true
    });
    console.log(zip.files);
};

run();