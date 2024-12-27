// @ts-nocheck

import React, { useEffect, useRef, useState } from "react";
import Nouislider from "nouislider-react";
import "nouislider/distribute/nouislider.css";
import "./App.css";

let ffmpeg;

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [videoSrc, setVideoSrc] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [videoTrimmedUrl, setVideoTrimmedUrl] = useState("");
  const videoRef = useRef();

  // Convert the time obtained from the video to HH:MM:SS format
  const convertToHHMMSS = (val) => {
    const secNum = parseInt(val, 10);
    let hours = Math.floor(secNum / 3600);
    let minutes = Math.floor((secNum - hours * 3600) / 60);
    let seconds = secNum - hours * 3600 - minutes * 60;

    if (hours < 10) hours = "0" + hours;
    if (minutes < 10) minutes = "0" + minutes;
    if (seconds < 10) seconds = "0" + seconds;

    return hours === "00"
      ? `${minutes}:${seconds}`
      : `${hours}:${minutes}:${seconds}`;
  };

  useEffect(() => {
    const loadFFmpegScript = async () => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.2/dist/ffmpeg.min.js";
      script.onload = async () => {
        ffmpeg = window.FFmpeg.createFFmpeg({ log: true });
        await ffmpeg.load();
        setIsScriptLoaded(true);
      };
      document.body.appendChild(script);
    };

    loadFFmpegScript();
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        const duration = videoRef.current.duration;
        setVideoDuration(duration);
        setEndTime(duration);
      };
    }
  }, [videoSrc]);

  const updateOnSliderChange = (values, handle) => {
    setVideoTrimmedUrl("");
    let readValue = Math.floor(values[handle]);

    if (handle === 1) {
      setEndTime(readValue);
    } else {
      setStartTime(readValue);
      if (videoRef.current) videoRef.current.currentTime = readValue;
    }
  };

  const handlePlay = () => {
    if (videoRef.current) videoRef.current.play();
  };

  const handlePauseVideo = (e) => {
    if (Math.floor(e.currentTarget.currentTime) === endTime) {
      e.currentTarget.pause();
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];

    if (file) {
      const blobURL = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoSrc(blobURL);
    } else {
      alert("Please select file first");
    }
  };

  const chunkTheVideo = async (
    videoFile,
    videoFileType,
    chunkSize = 50 * 1024 * 1024
  ) => {
    const totalChunks = Math.ceil(videoFile.size / chunkSize),
      chunkFiles = [];
    let currPosition = 0;

    for (let i = 0; i < totalChunks; i++) {
      const chunk = videoFile.slice(currPosition, currPosition + chunkSize);
      currPosition += chunkSize;

      // Calculate the chunk's start and end times based on the video duration
      const chunkStartTime = (i / totalChunks) * videoDuration;
      const chunkEndTime = ((i + 1) / totalChunks) * videoDuration;

      // Include only chunks that intersect with the trimming range
      // if (chunkStartTime < endTime && chunkEndTime > startTime) {
      const arrayBuffer = await chunk.arrayBuffer();
      const chunkName = `chunk-${i}.${videoFileType}`;
      ffmpeg.FS("writeFile", chunkName, new Uint8Array(arrayBuffer));
      chunkFiles.push(chunkName);
      // }
    }

    return chunkFiles;
  };

  const concateUint8Arrays = (arrays) => {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      combined.set(arr, offset);
      offset += arr.length;
    }
    return combined;
  };

  const concatVideoChunks = async (chunksFiles, videoFileType) => {
    if (chunksFiles.length === 0) {
      console.log("No chunks files is concatenate");
    }

    try {
      const chunkDataArray = await Promise.all(
        chunksFiles.map((fileName) => ffmpeg.FS("readFile", fileName))
      );

      const combinedArray = concateUint8Arrays(chunkDataArray);

      const combinedFileName = `combined-video.${videoFileType}`;
      ffmpeg.FS("writeFile", combinedFileName, combinedArray);

      return combinedFileName;
    } catch (error) {
      console.log({ error });
    }
  };

  const handleTrim = async () => {
    try {
      setIsLoading(true);

      const { name, type } = videoFile;
      const videoFileType = type.split("/")[1];

      if (isScriptLoaded && videoFile) {
        const chunksFiles = await chunkTheVideo(videoFile, videoFileType);

        const concatChunks = await concatVideoChunks(
          chunksFiles,
          videoFileType
        );

        const duration = endTime - startTime;
        const outputFileName = `output-trimmed-0.mp4`;

        await ffmpeg.run(
          "-v",
          "verbose",
          "-i",
          concatChunks,
          "-ss",
          String(startTime),
          "-t",
          String(duration),
          "-c",
          "copy",
          "-strict",
          "experimental",
          "-force_key_frames",
          "0",
          "-async",
          "1",
          "-preset",
          "ultrafast",
          outputFileName
        );

        // Check if the output file exists after trimming
        const outputFileExists = ffmpeg
          .FS("readdir", "/")
          .includes(outputFileName);

        if (!outputFileExists) {
          throw new Error(
            `Output file ${outputFileName} does not exist after trim.`
          );
        }

        // Read the processed file and generate the Blob
        const trimmedChunk = ffmpeg.FS("readFile", outputFileName);
        const finalVideo = new Blob([trimmedChunk.buffer], {
          type: "video/mp4",
        });

        // Create a URL for the trimmed video and set it
        setVideoTrimmedUrl(URL.createObjectURL(finalVideo));
      }
    } catch (error) {
      console.error("Error in handleTrim:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        background: 'linear-gradient(135deg, #f0f4f8, #d9e8ff)',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          background: '#ffffff',
          borderRadius: '10px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
          padding: '20px',
        }}
      >
        <h1 style={{ textAlign: 'center', marginBottom: '20px', color: '#333' }}>
          Video Trimmer
        </h1>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          <label
            htmlFor="file-upload"
            style={{
              display: 'inline-block',
              backgroundColor: '#007bff',
              color: '#fff',
              padding: '10px 20px',
              fontSize: '16px',
              borderRadius: '5px',
              cursor: 'pointer',
              transition: 'background-color 0.3s ease',
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = '#0056b3')}
            onMouseOut={(e) => (e.target.style.backgroundColor = '#007bff')}
          >
            Upload Video
          </label>
          <input
            id="file-upload"
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            style={{
              display: 'none',
            }}
          />
        </div>
  
        {videoSrc && (
          <div>
            <video
              src={videoSrc}
              ref={videoRef}
              onTimeUpdate={handlePauseVideo}
              controls
              style={{
                width: '100%',
                borderRadius: '10px',
                marginBottom: '20px',
              }}
            />
            <div style={{ marginBottom: '20px' }}>
              <Nouislider
                behaviour="tap-drag"
                step={1}
                range={{ min: 0, max: videoDuration || 2 }}
                start={[startTime, endTime]}
                connect
                onUpdate={updateOnSliderChange}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                color: '#666',
                marginBottom: '20px',
              }}
            >
              <span>Start: {convertToHHMMSS(startTime)}</span>
              <span>End: {convertToHHMMSS(endTime)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                marginBottom: '20px',
              }}
            >
              <button
                onClick={handlePlay}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'background-color 0.3s ease',
                }}
                onMouseOver={(e) => (e.target.style.backgroundColor = '#218838')}
                onMouseOut={(e) => (e.target.style.backgroundColor = '#28a745')}
              >
                Play
              </button>
              <button
                onClick={handleTrim}
                disabled={isLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isLoading ? '#6c757d' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  transition: 'background-color 0.3s ease',
                }}
                onMouseOver={(e) =>
                  !isLoading && (e.target.style.backgroundColor = '#0056b3')
                }
                onMouseOut={(e) =>
                  !isLoading && (e.target.style.backgroundColor = '#007bff')
                }
              >
                {isLoading ? 'Trimming...' : 'Trim'}
              </button>
            </div>
            {videoTrimmedUrl && (
              <div>
                <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>
                  Trimmed Video
                </h2>
                <video
                  src={videoTrimmedUrl}
                  controls
                  style={{
                    width: '100%',
                    borderRadius: '10px',
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
}

export default App;
