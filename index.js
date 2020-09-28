const fs = require('fs');
const usb = require('usb');

const VID = 0x057E, PID = 0x3000;

const CMD_ID_EXIT = 0;
const CMD_ID_LIST = 1;
const CMD_ID_FILE_RANGE = 2;

const CMD_TYPE_REQUEST = 0;
const CMD_TYPE_RESPONSE = 1;
const CMD_TYPE_ACK = 2;

const BUFFER_SEGMENT_DATA_SIZE = 0x100000;

class DBI {
  constructor(fileList) {
    if (typeof fileList === 'string') fileList = [fileList];

    this.nspList = {};
    for (const file of fileList) {
      // const stat = fs.statSync(file);
      const title = file.split('/').pop();

      this.nspList[title] = {
        file,
        // stat,
      };
    }
  }

  async start() {
    if (!this.dev) {
      this.dev = await this.waitDevice();
      const endpoints = this.dev.interfaces[0].endpoints;
      const [InEndpoint, OutEndpoint] = endpoints;
      this.InEndpoint = InEndpoint;
      this.OutEndpoint = OutEndpoint;
    }

    // console.log('read new cmd');
    const cmd = await this.cmdRead();
    // console.log(cmd);

    const actions = {
      [CMD_ID_EXIT]: 'proccessCmdExit',
      [CMD_ID_LIST]: 'proccessCmdList',
      [CMD_ID_FILE_RANGE]: 'proccessCmdFileRange',
    }

    const action = actions[cmd.id] || 'unknownCmd';

    await this[action](cmd);


    // console.log('NEXT STEP');
    this.start();
  }

  async waitDevice() {
    try {
      // console.log('findDev');
      const dev = usb.findByIds(VID, PID);
      if (!dev) throw 'Device not connected';
      dev.open();
      return dev;
    }
    catch (err) {
      console.error(err);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(this.waitDevice());
        }, 1000)
      });
    }
  }


  async unknownCmd() {
    console.warning('CMD UNKNOWN');
  }

  async proccessCmdExit() {
    console.log('CMD_ID_EXIT');
    await this.cmdWrite({id: CMD_ID_EXIT});
    try {
      this.dev.close();
    }
    catch (err) {
      console.warning(err);
    }

    this.dev = null;
  }

  async proccessCmdList({id}) {
    console.log('CMD_ID_LIST');
    const list = Buffer.from(Object.keys(this.nspList).join('\n'));

    await this.cmdWrite({id, data_size: list.length});
    const ans = await this.cmdRead();
    // console.log('list', {ans});
    return this.bufferWrite(list);
  }

  async proccessCmdFileRange({id, data_size}) {
    console.log('CMD_ID_FILE_RANGE');
    await this.cmdWrite({
      type: CMD_TYPE_ACK,
      id,
      data_size,
    });

    const buffer = await this.bufferRead(data_size);

    const range_size = buffer.readUInt32LE(0);
    const range_offset = parseInt(buffer.readBigInt64LE(4)); // readBigInt64LE
    const nspNameLen = buffer.readUInt32LE(12);
    const nspName = buffer.slice(16).toString();

    console.log({
      range_size,
      range_offset,
      // nspNameLen,
      nspName,
    });

    const nsp = this.nspList[nspName];
    if (!nsp) {
      console.error('Can`t find selected nsp');
      return this.proccessCmdExit();
    }

    // console.log({nsp});

    await this.cmdWrite({
      type: CMD_TYPE_RESPONSE,
      id,
      data_size: range_size,
    });

    const ans = await this.cmdRead();
    // console.log({ans});

    const fd = fs.openSync(nsp.file);
    const end_off = range_size;
    let curr_off = 0x0,
      read_size = BUFFER_SEGMENT_DATA_SIZE,
      position = range_offset;

    while (curr_off < end_off) {
      if (curr_off + read_size >= end_off)
        read_size = end_off - curr_off;

      /*console.log({
        curr_off,
        end_off,
        read_size,
        position,
      });*/

      let buffer = Buffer.allocUnsafe(read_size);
      const readed = fs.readSync(fd, buffer, 0, read_size, position);
      // console.log({buffer, readed});
      position = null;
      await this.bufferWrite(buffer);
      curr_off += read_size;
    }
  }


  async cmdRead() {
    const buffer = await this.bufferRead(16);
    const magic = buffer.slice(0, 4).toString();
    const type = buffer.readUInt32LE(4);
    const id = buffer.readUInt32LE(8);
    const data_size = buffer.readUInt32LE(12);

    return {
      magic,
      type,
      id,
      data_size,
    };
  }

  async cmdWrite({
    magic = 'DBI0',
    type = CMD_TYPE_RESPONSE,
    id = CMD_ID_EXIT,
    data_size = 0,
  }) {
    let cmd = Buffer.allocUnsafe(16);
    cmd.write(magic);
    cmd.writeUInt32LE(type, 4);
    cmd.writeUInt32LE(id, 8);
    cmd.writeUInt32LE(data_size, 12);
    // console.log('cmdWrite', cmd);

    return this.bufferWrite(cmd);
  }


  async bufferRead(length) {
    if (!length) length = this.InEndpoint.descriptor.wMaxPacketSize;

    return new Promise((resolve, reject) => {
      this.InEndpoint.transfer(length, (err, buffer) => {
        if (err) return reject(err);

        // console.log('bufferRead', buffer);
        return resolve(buffer);
      })
    })
  }

  async bufferWrite(buffer) {
    return new Promise((resolve, reject) => {
      this.OutEndpoint.transfer(buffer, (err) => {
        if (err) return reject(err);

        // console.log('bufferWrite:finished', buffer);
        return resolve();
      })
    })
  }
}


module.exports = DBI;
