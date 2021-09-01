const spawn = require('child_process').spawn;

module.exports = function(cmd, args, cb) {

    console.log('cmd', cmd)
    console.log('args', args)

    const process = spawn(cmd, args);
    process.on('error', function( err ){ console.log('eroooor', err) })
    process.on('close', function(status) {
        if (status == 0) {
           cb && cb();    
        } else {
            cb && cb(new Error(cmd + " failed with status " + status));
        }
    });

    process.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    process.stderr.on('data', (data) => {
      console.error(data.toString());
    });

}
