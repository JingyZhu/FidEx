const { FixDecider } = require('./fix-decider');
const { program } = require('commander');

program
    .option('-d, --dir <path>', 'Path to logs')
    .option('-o, --output <path>', 'Path to save the result')
    .parse(process.argv);

const options = program.opts();
const fixDecider = new FixDecider({ path: options.dir });
fixDecider.readLogs();
fixDecider.saveRules({path: `${options.output}/.fix_decider_rules.json`});