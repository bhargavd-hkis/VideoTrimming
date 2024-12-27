export const loadScript = (src: any) => {
  return new Promise((onFulfilled, _) => {
    const script = document.createElement("script");
    let loaded;
    script.async = "async";
    script.defer = "defer";
    script.setAttribute("src", src);
    script.onreadystatechange = script.onload = () => {
      if (!loaded) {
        onFulfilled(script);
      }
      loaded = true;
    };
    script.onerror = function () {
      console.log("Script failed to load");
    };
    document.getElementsByTagName("head")[0].appendChild(script);
  });
};

const CHUNK_SIZE = 1000 * 1024 * 1024; // 100 MB per chunk

export const splitVideoIntoChunks = (file) => {
  const chunks = [];
  let start = 0;

  while (start < file.size) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    chunks.push(file.slice(start, end));
    start = end;
  }

  return chunks;
};
