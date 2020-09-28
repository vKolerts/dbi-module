const DBI = require('./index');
const argv =  process.argv.splice(2);

const dbi = new DBI(argv);
dbi.start();
