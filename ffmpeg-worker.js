importScripts('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.2/dist/ffmpeg.min.js');

const ffmpeg = FFmpeg.createFFmpeg({ log: true });

ffmpeg.load().then(() => {
  postMessage({ type: 'loaded' }); // Notify the main thread that FFmpeg is loaded

  onmessage = async (e) => {
    const { type, videoFile, startTime, endTime } = e.data;

    if (type === 'trim') {
      try {
        const inputFileName = 'input-video.mp4';
        await ffmpeg.FS('writeFile', inputFileName, videoFile);

        const duration = endTime - startTime;
        if (duration <= 0) {
          throw new Error(`Invalid duration for trimming: ${duration}. Start: ${startTime}, End: ${endTime}`);
        }

        const outputFileName = 'output-trimmed-0.mp4';
        await ffmpeg.run('-i', inputFileName, '-ss', String(startTime), '-t', String(duration), '-c', 'copy', outputFileName);

        const output = ffmpeg.FS('readFile', outputFileName);

        postMessage({
          type: 'trimmed',
          file: output,
        });
      } catch (error) {
        postMessage({
          type: 'error',
          error: error.message,
        });
      }
    }
  };
});
