import mp4probe from 'mux.js/lib/mp4/probe';
import {
  detectContainerForBytes,
  isLikelyFmp4MediaSegment
} from '@videojs/vhs-utils/dist/containers';

var segmentTrackAndTimingInfoHandled = false;

function handleSegmentBytes(
  segment,
  bytes,
  segmentDone,
  firstChunkFlag,
  trackInfoFn,
  timingInfoFn,
  dataFn,
  chunkFn,
  doneFn
) {
  	const bytesAsUint8Array = new Uint8Array(bytes);

  	const {tracks} = segment.map;

	segment.isFmp4 = true;

	if (bytes.byteLength && !segmentDone)
	{
    	// Only do this once
		//if (!segmentTrackAndTimingInfoHandled) 
		//{
    		const trackInfo = {
      			isFmp4: true,
      			hasVideo: !!tracks.video,
      			hasAudio: !!tracks.audio
    		};

			if (tracks.audio && tracks.audio.codec && tracks.audio.codec !== 'enca') 
			{
      			trackInfo.audioCodec = tracks.audio.codec;
    		}

			if (tracks.video && tracks.video.codec && tracks.video.codec !== 'encv') 
			{
      			trackInfo.videoCodec = tracks.video.codec;
    		}

			if (tracks.video && tracks.audio) 
			{
      			trackInfo.isMuxed = true;
    		}

      		trackInfoFn(segment, trackInfo);

      		const timingInfo = mp4probe.startTime(segment.map.timescales, bytesAsUint8Array);

			if (trackInfo.hasAudio && !trackInfo.isMuxed) 
			{
      			timingInfoFn(segment, 'audio', 'start', timingInfo);
    		}

    		if (trackInfo.hasVideo) {
      			timingInfoFn(segment, 'video', 'start', timingInfo);
			}

			segmentTrackAndTimingInfoHandled = true;
    	//}

		chunkFn(segment, {data: bytesAsUint8Array, type: tracks.audio ? 'audio' : 'video'}, firstChunkFlag);
	}
	else if (segmentTrackAndTimingInfoHandled)
	{
		dataFn(segment, {data: bytes, type: tracks.audio ? 'audio' : 'video'});
		doneFn(null, segment, {});
	}
}

function waitForCompletion(
  	segment,
  	responseBuffer,
  	segmentDone,
  	needInit,
  	initRcvd,
  	firstChunkReceiveTime,
  	firstChunkFlag,
  	trackInfoFn,
  	timingInfoFn,
  	dataFn,
  	chunkFn,
  	doneFn
) {
  	// We only start appending data to source buffers after both the init segment and the first media chunk are received.
	if (firstChunkReceiveTime > 0 && ((needInit && initRcvd) || !needInit)) 
	{
    	segment.endOfAllRequests = Date.now();

    	handleSegmentBytes(
        	segment,
        	responseBuffer,
      		segmentDone,
      		firstChunkFlag,
        	trackInfoFn,
        	timingInfoFn,
      		dataFn,
      		chunkFn,
      		doneFn
    	);
	} 
}

function handleInitSegmentResponse(
  	segment,
	responseBuffer,
	segmentDone,
  	needInit,
  	initRcvd,
  	firstChunkReceiveTime,
  	firstChunkFlag,
  	trackInfoFn,
  	timingInfoFn,
  	dataFn,
  	chunkFn,
  	doneFn
) {
  	segment.map.bytes = new Uint8Array(responseBuffer);

  	//let dec = new TextDecoder("utf-8");
  	//console.log(dec.decode(segment.map.bytes));

  	const type = detectContainerForBytes(segment.map.bytes);

	if (type !== 'mp4') 
	{
    	return;
  	}

  	const tracks = mp4probe.tracks(segment.map.bytes);

  	tracks.forEach(function(track) {
    	segment.map.tracks = segment.map.tracks || {};

    	// only support one track of each type for now
		if (segment.map.tracks[track.type]) 
		{
      		console.log('audioSegmentFetch: only support one track of each media type');
      		return;
    	}

    	segment.map.tracks[track.type] = track;

		if (track.id && track.timescale) 
		{
      		segment.map.timescales = segment.map.timescales || {};
      		segment.map.timescales[track.id] = track.timescale;
    	}
  	});

	waitForCompletion(
    	segment,
		responseBuffer,
		segmentDone,
    	needInit,
    	initRcvd,
    	firstChunkReceiveTime,
    	firstChunkFlag,
    	trackInfoFn,
    	timingInfoFn,
    	dataFn,
    	chunkFn,
    	doneFn
  	);
}

function handleMediaDataResponse(
  segment,
  responseBuffer,
  segmentDone,
  needInit,
  initRcvd,
  firstChunkReceiveTime,
  firstChunkFlag,
  trackInfoFn,
  timingInfoFn,
  dataFn,
  chunkFn,
  doneFn
) {
	if (responseBuffer.byteLength > 0 && !segmentDone)
	{
  		const type = detectContainerForBytes(new Uint8Array(responseBuffer));

  		// tmp
		if (type !== 'mp4') 
		{
    		//return;
		}
	}

  	waitForCompletion(
    	segment,
    	responseBuffer,
    	segmentDone,
    	needInit,
    	initRcvd,
    	firstChunkReceiveTime,
    	firstChunkFlag,
    	trackInfoFn,
    	timingInfoFn,
    	dataFn,
    	chunkFn,
    	doneFn
  	);
}

function concatTypedArray(remaining, data) 
{
	if (remaining.length === 0) 
	{
    	return data;
  	}

  	const result = new Uint8Array(remaining.length + data.length);

  	result.set(remaining);

  	result.set(data, remaining.length);
  	return result;
}

class IsoBoxSearchInfo {
  	constructor(lastCompletedOffset, found, size) 
  	{
    	this.lastCompletedOffset = lastCompletedOffset;
    	this.found = found;
    	this.size = size;
  	}
}

function parseUint32(data, offset) 
{
  	return data[offset + 3] >>> 0 |
        (data[offset + 2] << 8) >>> 0 |
        (data[offset + 1] << 16) >>> 0 |
        (data[offset] << 24) >>> 0;
}

function parseIsoBoxType(data, offset) 
{
  	return String.fromCharCode(data[offset++]) +
        String.fromCharCode(data[offset++]) +
        String.fromCharCode(data[offset++]) +
        String.fromCharCode(data[offset]);
}

function findLastTopIsoBoxCompleted(types, buffer, offset) 
{
	if (offset === undefined) 
	{
    	offset = 0;
  	}

  	// 8 = size (uint32) + type (4 characters)
	if (!buffer || offset + 8 >= buffer.byteLength) 
	{
    	return new IsoBoxSearchInfo(0, false);
  	}

  	const data = (buffer instanceof ArrayBuffer) ? new Uint8Array(buffer) : buffer;
  	let boxInfo;
  	let lastCompletedOffset = 0;

	while (offset < data.byteLength) 
	{
    	const boxSize = parseUint32(data, offset);
    	const boxType = parseIsoBoxType(data, offset + 4);

		if (boxSize === 0) 
		{
      		break;
    	}

		if (offset + boxSize <= data.byteLength) 
		{
			if (types.indexOf(boxType) >= 0) 
			{
        		boxInfo = new IsoBoxSearchInfo(offset, true, boxSize);
			} 
			else 
			{
        		lastCompletedOffset = offset + boxSize;
      		}
    	}

    	offset += boxSize;
  	}

	if (!boxInfo) 
	{
    	return new IsoBoxSearchInfo(lastCompletedOffset, false);
  	}

  	return boxInfo;
}

export const audioSegmentFetch = ({
  segment,
  trackInfoFn,
  timingInfoFn,
  dataFn,
  chunkFn,
  doneFn
}) => {
  	let needInit = false;
  	let initRcvd = false;
  	let firstChunkReceiveTime = 0;
  	let firstChunkFlag = false;
  	let segmentDone = false;

	segmentTrackAndTimingInfoHandled= false;

	// Fetch init segment first, if needed and not already loaded
  	if (segment.map && !segment.map.bytes) {
    	// init segment required
    	needInit = true;

		const initReq = new XMLHttpRequest();
		initReq.responseType = 'arraybuffer';

    	initReq.open('GET', segment.map.resolvedUri);

    	initReq.onload = function() {
			if (this.status >= 200 && this.status < 300) 
			{
        		initRcvd = true;

        		handleInitSegmentResponse(
          			segment,
					this.response,
					segmentDone,
          			needInit,
          			initRcvd,
          			firstChunkReceiveTime,
          			firstChunkFlag,
        			trackInfoFn,
        			timingInfoFn,
          			dataFn,
          			chunkFn,
          			doneFn
        		);
		  	} 
		  	else 
		  	{
        		console.log('audioSegmentFetch Error downloading init segment!');
        		throw new Error(`Error downloading init segment! status: ${this.status}`);
      		}
    	};

    	initReq.send();
  	}

  	// Fetch the media segment
	fetch(segment.resolvedUri).then(function(response) 
	{
    	if (!response.ok) {
          	throw new Error(`Error downloading audio segment! status: ${response.status}`);
       	}

    	if (!response.body) {
      		console.log('audioSegmentFetch Empty audio init segment body');
    	}

    	let remaining = new Uint8Array();
    	let offset = 0;
    	const reader = response.body.getReader();

    	const processMediaSegmentData = function({value, done}) {
			if (done) 
			{
        		segmentDone = true;
				if (remaining) 
				{
            		handleMediaDataResponse(
                		segment,
                		remaining.buffer,
            			segmentDone,
            			needInit,
            			initRcvd,
            			firstChunkReceiveTime,
            			firstChunkFlag,
                		trackInfoFn,
                		timingInfoFn,
            			dataFn,
            			chunkFn,
            			doneFn
          			);
        		}

        		return;
      		}

			if (value && value.length > 0) 
			{
        		remaining = concatTypedArray(remaining, value);
        		const boxesInfo = findLastTopIsoBoxCompleted(['mdat'], remaining, offset);

				if (boxesInfo.found) 
				{
          			const end = boxesInfo.lastCompletedOffset + boxesInfo.size;

          			let data;

					if (end === remaining.length) 
					{
            			data = remaining;
            			remaining = new Uint8Array();
					} 
					else 
					{
            			data = new Uint8Array(remaining.subarray(0, end));
            			remaining = remaining.subarray(end);
          			}

          			segmentDone = false;
					if (firstChunkReceiveTime === 0) 
					{
            			firstChunkReceiveTime = Date.now();
            			firstChunkFlag = true;
					} 
					else 
					{
            			firstChunkFlag = false;
					}

          			handleMediaDataResponse(
            			segment,
            			data.buffer,
            			segmentDone,
            			needInit,
            			initRcvd,
            			firstChunkReceiveTime,
            			firstChunkFlag,
            			trackInfoFn,
            			timingInfoFn,
            			dataFn,
            			chunkFn,
            			doneFn
          			);

          			offset = 0;
				} 
				else 
				{
          			offset = boxesInfo.lastCompletedOffset;
        		}
      		}

      		reader.read().then(processMediaSegmentData);
    	};

    	reader.read().then(processMediaSegmentData);
  	});
};
