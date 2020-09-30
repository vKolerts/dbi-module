# DBI backend module
Node.JS port of https://github.com/lunixoid/dbibackend

### Install
```sh
  npm i switch-dbi
```

### Use:
```js
  const eventListenerExample = (eventTitle, data) => {
    /*eventTitles = [
      'connected',
      'waitDevice',
      'proccessCmdExit',
      'proccessCmdList',
      'proccessCmdFileRange',
      'readFileRange',
      'unknownCmd',
      'error',
    ]*/
    console.log(eventTitle, data)
  };

  const DBI = require('switch-dbi');
  const dbi = new DBI(
    [
      'path/to/file1.nsp',
      'path/to/file2.nsp'
    ],
    eventListenerExample // optional
  );

  dbi
  .start() // async
  .catch(console.error);
```