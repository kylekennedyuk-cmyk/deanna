(() => {
  const modal = document.getElementById('image-picker-modal');
  if (!modal) return;

  const form = document.getElementById('page-editor');
  const fileInput = document.getElementById('image-picker-file');
  const altInput = document.getElementById('image-picker-alt');
  const uploadError = modal.querySelector('[data-image-upload-error]');
  const libraryEl = modal.querySelector('[data-image-library]');
  const libraryStatus = modal.querySelector('[data-image-library-status]');
  const tabs = [...modal.querySelectorAll('[data-image-tab]')];
  const panels = [...modal.querySelectorAll('[data-image-panel]')];

  let activePicker = null;
  let libraryLoaded = false;
  let libraryItems = [];

  function csrfToken() {
    return (
      (form && form.dataset.csrf) ||
      document.querySelector('input[name="_csrf"]')?.value ||
      ''
    );
  }

  function uploadUrl() {
    return (form && form.dataset.mediaUpload) || '/admin/media/upload';
  }

  function listUrl() {
    return (form && form.dataset.mediaJson) || '/admin/media/json';
  }

  function filenameFromUrl(url) {
    if (!url) return 'No file chosen';
    try {
      const clean = String(url).split('?')[0];
      const parts = clean.split('/');
      return parts[parts.length - 1] || clean;
    } catch {
      return url;
    }
  }

  function setPickerValue(picker, url) {
    if (!picker) return;
    const value = String(url || '').trim();
    const hidden = picker.querySelector('.image-picker-value');
    const advanced = picker.querySelector('.image-picker-url-input');
    const thumb = picker.querySelector('.image-picker-thumb');
    const empty = picker.querySelector('.image-picker-empty');
    const pathLabel = picker.querySelector('.image-picker-path');

    if (hidden) {
      hidden.value = value;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (advanced && advanced.value !== value) advanced.value = value;
    if (pathLabel) pathLabel.textContent = value ? filenameFromUrl(value) : 'No file chosen';

    if (thumb) {
      if (value) {
        thumb.src = value;
        thumb.hidden = false;
      } else {
        thumb.removeAttribute('src');
        thumb.hidden = true;
      }
    }
    if (empty) empty.hidden = Boolean(value);
  }

  function openModal(picker) {
    activePicker = picker;
    if (uploadError) {
      uploadError.textContent = '';
      uploadError.classList.add('hidden');
    }
    if (fileInput) fileInput.value = '';
    if (altInput) altInput.value = '';
    showTab('upload');
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', 'open');
  }

  function closeModal() {
    activePicker = null;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }

  function showTab(name) {
    tabs.forEach((tab) => {
      const active = tab.dataset.imageTab === name;
      tab.classList.toggle('is-active', active);
      tab.classList.toggle('btn-secondary', active);
      tab.classList.toggle('btn-ghost', !active);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.imagePanel !== name);
    });
    if (name === 'library') loadLibrary();
  }

  async function loadLibrary(force = false) {
    if (libraryLoaded && !force) return;
    if (libraryStatus) libraryStatus.textContent = 'Loading library…';
    if (libraryEl) libraryEl.innerHTML = '';
    try {
      const response = await fetch(listUrl(), {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error((data && data.error) || 'Could not load media library.');
      }
      libraryItems = data.media || [];
      libraryLoaded = true;
      renderLibrary();
    } catch (err) {
      if (libraryStatus) libraryStatus.textContent = err.message || 'Could not load media library.';
    }
  }

  function renderLibrary() {
    if (!libraryEl) return;
    if (!libraryItems.length) {
      if (libraryStatus) libraryStatus.textContent = 'No images in the library yet. Upload one first.';
      libraryEl.innerHTML = '';
      return;
    }
    if (libraryStatus) libraryStatus.textContent = `${libraryItems.length} image${libraryItems.length === 1 ? '' : 's'}`;
    libraryEl.innerHTML = libraryItems
      .map(
        (item) => `
      <button type="button" class="image-picker-library-item" data-select-url="${encodeURIComponent(item.url)}" title="${item.alt || item.caption || item.url}">
        <img src="${item.url}" alt="${item.alt || ''}" loading="lazy" />
        <span>${filenameFromUrl(item.url)}</span>
      </button>`
      )
      .join('');
  }

  async function uploadSelected() {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      if (uploadError) {
        uploadError.textContent = 'Choose an image to upload.';
        uploadError.classList.remove('hidden');
      }
      return;
    }

    const body = new FormData();
    body.append('image', fileInput.files[0]);
    body.append('_csrf', csrfToken());
    if (altInput && altInput.value.trim()) body.append('alt', altInput.value.trim());

    if (uploadError) {
      uploadError.textContent = '';
      uploadError.classList.add('hidden');
    }

    try {
      const response = await fetch(uploadUrl(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'x-csrf-token': csrfToken(),
        },
        body,
        credentials: 'same-origin',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error((data && data.error) || 'Upload failed.');
      }
      setPickerValue(activePicker, data.url);
      libraryLoaded = false;
      closeModal();
    } catch (err) {
      if (uploadError) {
        uploadError.textContent = err.message || 'Upload failed.';
        uploadError.classList.remove('hidden');
      }
    }
  }

  function bindPicker(picker) {
    if (!picker || picker.dataset.pickerBound === '1') return;
    picker.dataset.pickerBound = '1';

    const advanced = picker.querySelector('.image-picker-url-input');
    const hidden = picker.querySelector('.image-picker-value');
    if (hidden) setPickerValue(picker, hidden.value);

    picker.querySelector('[data-image-change]')?.addEventListener('click', () => openModal(picker));
    picker.querySelector('[data-image-remove]')?.addEventListener('click', () => setPickerValue(picker, ''));

    if (advanced) {
      advanced.addEventListener('input', () => setPickerValue(picker, advanced.value));
      advanced.addEventListener('change', () => setPickerValue(picker, advanced.value));
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-image-modal-close]')) {
      closeModal();
      return;
    }

    const tab = target.closest('[data-image-tab]');
    if (tab && modal.contains(tab)) {
      showTab(tab.dataset.imageTab);
      return;
    }

    if (target.closest('[data-image-upload]')) {
      uploadSelected();
      return;
    }

    const libraryItem = target.closest('[data-select-url]');
    if (libraryItem && modal.contains(libraryItem)) {
      setPickerValue(activePicker, decodeURIComponent(libraryItem.dataset.selectUrl || ''));
      closeModal();
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  window.ImagePicker = {
    bindAll(root = document) {
      root.querySelectorAll('[data-image-picker]').forEach(bindPicker);
    },
    bind(picker) {
      bindPicker(picker);
    },
    setValue: setPickerValue,
  };

  window.ImagePicker.bindAll(document);
})();
