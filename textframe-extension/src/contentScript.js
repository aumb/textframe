'use strict';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import './contentScript.css';

(function () {
  let currentMarkers = [];
  let currentSearchTerm = '';
  let apiUrl = process.env.API_URL;

  async function getUUID() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get('uuid', (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result && result.uuid) {
          resolve(result.uuid);
        } else {
          reject(new Error('UUID not found in storage.'));
        }
      });
    });
  }

  async function getNonce() {
    try {
      const uuid = await getUUID();
      const response = await fetch(`${apiUrl}/get_nonce`, {
        method: 'POST',
        headers: {
          'X-UUID': uuid,
        },
      });

      if (!response.ok) {
        throw new Error(`Nonce retrieval failed: ${response.status}`);
      }

      const data = await response.json();
      return data.nonce;
    } catch (error) {
      console.error('Error getting nonce:', error);
      throw error;
    }
  }

  async function signNonce(nonce) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['privateKey'], function (result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const privateKey = result.privateKey;

        if (!privateKey) {
          reject(new Error('Private key not found'));
          return;
        }
        try {
          const privateKeyDecoded = util.decodeBase64(privateKey);
          const signingKey = nacl.sign.keyPair.fromSecretKey(privateKeyDecoded);
          const nonceUint8Array = new TextEncoder().encode(nonce);
          const signatureBytes = nacl.sign.detached(
            nonceUint8Array,
            signingKey.secretKey
          );
          const signatureBase64 = util.encodeBase64(signatureBytes);
          resolve(signatureBase64);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function getYouTubeVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (videoId) return videoId;

    const patterns = [
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/,
      /^[a-zA-Z0-9_-]{11}$/,
    ];

    const url = window.location.href;

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    const embedElement = document.querySelector('ytd-watch-flexy');
    if (embedElement && embedElement.getAttribute('video-id')) {
      return embedElement.getAttribute('video-id');
    }

    return null;
  }

  async function fetchTimestamps(searchTerm) {
    try {
      const nonce = await getNonce();
      const signature = await signNonce(nonce);
      const uuid = await getUUID();

      const response = await fetch(`${apiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-UUID': uuid,
          'X-Nonce-Signature': signature,
        },
        body: JSON.stringify({
          query: searchTerm,
          video_id: getYouTubeVideoId(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const timestamps = data.map((timeStr) => parseFloat(timeStr));

      return timestamps;
    } catch (error) {
      console.error('Error fetching timestamps:', error);
      return [];
    }
  }

  function formatTimeDisplay(timeInSeconds) {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function createMarker(timeInSeconds, index) {
    const marker = document.createElement('div');
    marker.className = 'tf-marker';
    marker.setAttribute('data-index', index);

    const video = document.querySelector('video');
    if (!video) return null;

    const clampedTime = Math.min(Math.max(timeInSeconds, 0), video.duration);

    const position = (clampedTime / video.duration) * 100;
    const roundedPosition = Math.round(position * 100) / 100;

    marker.style.left = `${roundedPosition}%`;
    marker.setAttribute('data-time-seconds', clampedTime);

    const formattedTime = formatTimeDisplay(clampedTime);
    marker.setAttribute('data-time', formattedTime);

    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video) {
        document
          .querySelectorAll('.tf-marker')
          .forEach((m) => m.classList.remove('active'));
        marker.classList.add('active');
        video.currentTime = clampedTime;
      }
    });

    // Remove active class when video time changes significantly
    video.addEventListener('timeupdate', () => {
      if (Math.abs(video.currentTime - clampedTime) > 0.5) {
        marker.classList.remove('active');
      }
    });

    return marker;
  }

  function handleOverlappingMarker(marker, position) {
    const minSpacing = 1.5; // Minimum spacing between markers in percentage
    const currentPos = parseFloat(position);

    // Try positioning slightly to the right
    const newPosition = currentPos + minSpacing;

    // Only add the marker if it won't go off the progress bar
    if (newPosition <= 100) {
      marker.style.left = `${newPosition}%`;
      // Add visual indication that this marker represents multiple timestamps
      marker.classList.add('tf-marker-stacked');
      return marker;
    }

    return null;
  }

  function addMarkers(times) {
    if (!times || !times.length) return;

    clearMarkers(); // Clear existing markers first
    currentMarkers = times;

    const progressBar = document.querySelector('.ytp-progress-bar');
    if (!progressBar) return;

    let markerContainer = document.querySelector('.tf-marker-container');
    if (!markerContainer) {
      markerContainer = document.createElement('div');
      markerContainer.className = 'tf-marker-container';
      progressBar.appendChild(markerContainer);
    }

    const sortedTimes = [...times].sort((a, b) => a - b);

    const usedPositions = new Set();

    sortedTimes.forEach((time, index) => {
      const marker = createMarker(time, index);
      if (marker) {
        const position = marker.style.left;

        if (!usedPositions.has(position)) {
          markerContainer.appendChild(marker);
          usedPositions.add(position);
        } else {
          const offsetMarker = handleOverlappingMarker(marker, position);
          if (offsetMarker) {
            markerContainer.appendChild(offsetMarker);
          }
        }
      }
    });
  }

  function navigateToMarker(direction) {
    const video = document.querySelector('video');
    if (!video || currentMarkers.length === 0) return;

    const currentTime = video.currentTime;
    let targetTime;

    const timeOffset = 0.1;

    if (direction === 'next') {
      targetTime = currentMarkers.find(
        (time) => time > currentTime + timeOffset
      );

      if (targetTime === undefined && currentMarkers.length > 0) {
        targetTime = currentMarkers[0];
      }
    } else {
      const reversedMarkers = [...currentMarkers].reverse();
      targetTime = reversedMarkers.find(
        (time) => time < currentTime - timeOffset
      );

      if (targetTime === undefined && currentMarkers.length > 0) {
        targetTime = currentMarkers[currentMarkers.length - 1];
      }
    }

    if (targetTime !== undefined) {
      video.currentTime = targetTime;
    }
  }

  function clearMarkers() {
    const markers = document.querySelectorAll('.tf-marker');
    markers.forEach((marker) => marker.remove());
    currentMarkers = [];
  }

  function updateNavigationButtons() {
    const prevButton = document.querySelector('.tf-prev-button');
    const nextButton = document.querySelector('.tf-next-button');

    if (currentMarkers.length === 0) {
      prevButton.disabled = true;
      nextButton.disabled = true;
    } else {
      prevButton.disabled = false;
      nextButton.disabled = false;
    }
  }

  function setSearchLoading(isLoading) {
    const searchContainer = document.querySelector('.tf-search-container');
    const searchInput = document.querySelector('.tf-search-input');
    const searchButton = document.querySelector('.tf-search-button');

    if (isLoading) {
      searchContainer.classList.add('tf-loading');
      searchInput.disabled = true;
      searchButton.style.opacity = '0.5';
      searchButton.style.cursor = 'wait';
      hideStatusMessage();
    } else {
      searchContainer.classList.remove('tf-loading');
      searchInput.disabled = false;
      searchButton.style.opacity = '1';
      searchButton.style.cursor = 'pointer';
    }
  }

  function showStatusMessage(message, type = 'info') {
    const statusMessage = document.querySelector('.tf-status-message');
    statusMessage.textContent = message;
    statusMessage.className = 'tf-status-message';

    if (type === 'error') {
      statusMessage.classList.add('error');
    } else if (type === 'empty') {
      statusMessage.classList.add('empty');
    }
  }

  function hideStatusMessage() {
    const statusMessage = document.querySelector('.tf-status-message');
    if (statusMessage) {
      statusMessage.className = 'tf-status-message';
    }
  }

  async function handleSearch(searchTerm) {
    if (!searchTerm.trim()) {
      return;
    }

    clearMarkers();
    updateNavigationButtons();
    hideStatusMessage();

    currentSearchTerm = searchTerm;
    setSearchLoading(true);

    try {
      const timestamps = await fetchTimestamps(searchTerm);

      if (timestamps.length > 0) {
        addMarkers(timestamps);
      } else {
        showStatusMessage('No results found for your search', 'empty');
        clearMarkers();
      }
    } catch (error) {
      console.error('Search failed:', error);
      showStatusMessage('Search failed. Please try again.', 'error');
      clearMarkers();
    } finally {
      setSearchLoading(false);
      updateNavigationButtons();
    }
  }

  function createSearchPopup() {
    const popup = document.createElement('div');
    popup.className = 'tf-search-popup';
    popup.innerHTML = `
      <div class="tf-search-container">
        <div class="tf-search-box">
          <input type="text" placeholder="Search" class="tf-search-input">
          <button class="tf-nav-button tf-prev-button" title="Previous result" disabled>
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
            </svg>
          </button>
          <button class="tf-nav-button tf-next-button" title="Next result" disabled>
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
            </svg>
          </button>
          <div class="tf-loading-spinner"></div>
          <div class="tf-search-button">
            <svg height="24" viewBox="0 0 24 24" width="24" focusable="false">
              <path d="m20.87 20.17-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.71zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" fill="currentColor"/>
            </svg>
          </div>
          <button class="tf-close-button" title="Clear search">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div class="tf-status-message"></div>
      </div>
    `;

    return popup;
  }

  function createCustomButton() {
    const button = document.createElement('button');
    button.className = 'ytp-button custom-youtube-button';
    button.innerHTML = `
      <svg viewBox="0 0 22 20" fill="none" class="tf-svg" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M16.668 15.0028C18.9724 15.0867 20.91 13.29 21 10.9858V5.01982C20.91 2.71569 18.9724 0.918932 16.668 1.00282H5.332C3.02763 0.918932 1.08998 2.71569 1 5.01982V10.9858C1.08998 13.29 3.02763 15.0867 5.332 15.0028H16.668Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path fill-rule="evenodd" clip-rule="evenodd" d="M10.508 5.17784L13.669 7.3258C13.8738 7.4454 13.9997 7.6647 13.9997 7.9018C13.9997 8.139 13.8738 8.3583 13.669 8.4778L10.508 10.8278C9.908 11.2348 9 10.8878 9 10.2518V5.75184C9 5.11884 9.909 4.77084 10.508 5.17784Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="4" y="17" width="14" height="1" rx="0.5" fill="currentColor" />
        <rect x="4.25" y="19.25" width="8.5" height="0.5" rx="0.25" fill="currentColor" stroke="currentColor" stroke-width="0.5" />
      </svg>
    `;

    button.setAttribute('data-priority', '3');
    button.setAttribute('data-title-no-tooltip', 'Textframe Button');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Textframe Button');
    button.setAttribute('title', 'Textframe Button');

    button.addEventListener('mouseenter', () => {
      button.classList.add('ytp-button-hover');
    });
    button.addEventListener('mouseleave', () => {
      button.classList.remove('ytp-button-hover');
    });

    return button;
  }

  function hidePopupAndClearMarkers(clearAll = false) {
    const popup = document.querySelector('.tf-search-popup');
    hideStatusMessage();
    if (popup) {
      popup.style.display = 'none';
      popup.classList.remove('show');
      if (clearAll) {
        popup.querySelector('.tf-search-input').value = '';
        currentSearchTerm = '';
        clearMarkers();
      }
    }
  }

  function insertButton() {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls || document.querySelector('.custom-youtube-button'))
      return;

    const customButton = createCustomButton();
    const searchPopup = createSearchPopup();

    customButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const popup = document.querySelector('.tf-search-popup');
      if (popup.style.display === 'none' || popup.style.display === '') {
        popup.style.display = 'block';
        popup.classList.add('show');
        const searchInput = popup.querySelector('.tf-search-input');
        searchInput.value = currentSearchTerm;
        searchInput.focus();
      } else {
        hidePopupAndClearMarkers(false);
      }
    });

    const searchInput = searchPopup.querySelector('.tf-search-input');

    searchInput.addEventListener('keydown', async (event) => {
      event.stopPropagation();

      if (event.key === 'Enter') {
        const searchTerm = event.target.value;
        await handleSearch(searchTerm);
      }

      if (event.key === 'Escape') {
        hidePopupAndClearMarkers(false);
      }
    });

    searchInput.addEventListener('keyup', (event) => event.stopPropagation());
    searchInput.addEventListener('keypress', (event) =>
      event.stopPropagation()
    );

    searchPopup
      .querySelector('.tf-prev-button')
      .addEventListener('click', () => {
        navigateToMarker('prev');
      });

    searchPopup
      .querySelector('.tf-next-button')
      .addEventListener('click', () => {
        navigateToMarker('next');
      });

    searchPopup
      .querySelector('.tf-close-button')
      .addEventListener('click', () => {
        hidePopupAndClearMarkers(true);
      });

    searchPopup
      .querySelector('.tf-search-button')
      .addEventListener('click', async () => {
        const searchTerm = searchPopup.querySelector('.tf-search-input').value;
        await handleSearch(searchTerm);
      });

    rightControls.insertBefore(customButton, rightControls.firstChild);
    document.querySelector('.html5-video-player').appendChild(searchPopup);
  }

  function cleanup() {
    hidePopupAndClearMarkers(true);
    observer.disconnect();
  }

  let videoId;
  const observer = new MutationObserver((_) => {
    let newVideoId = getYouTubeVideoId();
    if (newVideoId && newVideoId !== videoId) {
      videoId = newVideoId;
      hidePopupAndClearMarkers(true);
      insertButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('beforeunload', cleanup);
})();
