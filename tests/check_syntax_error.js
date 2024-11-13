// check_syntax.js
const fs = require('fs');
const vm = require('vm');

function checkSyntax(filePath) {
    try {
        const code = fs.readFileSync(filePath, 'utf-8');
        new vm.Script(code);  // Compiles and checks syntax without executing
        console.log("Syntax OK");
        process.exit(0);
    } catch (err) {
        if (/Cannot use .* outside a module/i.test(err.message)) {
            // Ignore this specific error
            console.log("Ignored module import error during syntax check.");
            process.exit(0);
        } else {
            // For other errors, output the error message
            console.error("Syntax Error:", err.message);
            process.exit(1);
        }
    }
}

checkSyntax(process.argv[2]);