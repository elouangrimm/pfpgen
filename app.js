(() => {
    // --- State ---
    let variantMode = 'auto'; // 'auto' | 'dark' | 'light'
    let resolvedVariant = 'dark'; // the actual variant being used
    let themeColor = '#3b82f6';
    let noiseIntensity = 18;
    let brandName = ''; // tracks last fetched brand for filenames

    // --- DOM refs ---
    const colorPicker = document.getElementById('color-picker');
    const colorHex = document.getElementById('color-hex');
    const noiseSlider = document.getElementById('noise-slider');
    const noiseValue = document.getElementById('noise-value');
    const previewCanvas = document.getElementById('preview-canvas');
    const dlOriginal = document.getElementById('dl-original');
    const dl1000 = document.getElementById('dl-1000');
    const dlCustom = document.getElementById('dl-custom');
    const customSizeInput = document.getElementById('custom-size');
    const variantBtns = document.querySelectorAll('.variant-btn');
    const brandInput = document.getElementById('brand-input');
    const brandFetchBtn = document.getElementById('brand-fetch-btn');
    const brandStatus = document.getElementById('brand-status');
    const brandColors = document.getElementById('brand-colors');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');

    const ctx = previewCanvas.getContext('2d');

    // --- Load base images ---
    const baseDark = new Image();
    const baseLight = new Image();
    let darkLoaded = false;
    let lightLoaded = false;

    baseDark.onload = () => { darkLoaded = true; render(); };
    baseLight.onload = () => { lightLoaded = true; render(); };
    baseDark.src = 'assets/base_dark.png';
    baseLight.src = 'assets/base_light.png';

    // --- Utility: parse hex to RGB ---
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    // --- Utility: relative luminance (WCAG) ---
    function relativeLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    // --- Determine best variant for contrast ---
    function bestVariant(hex) {
        const { r, g, b } = hexToRgb(hex);
        const lum = relativeLuminance(r, g, b);
        // Dark backgrounds => light shirt for contrast, light backgrounds => dark shirt
        return lum < 0.4 ? 'light' : 'dark';
    }

    // --- Resolve which variant to actually use ---
    function resolveVariant() {
        if (variantMode === 'auto') {
            resolvedVariant = bestVariant(themeColor);
        } else {
            resolvedVariant = variantMode;
        }
    }

    // --- Update variant button UI ---
    function updateVariantUI() {
        variantBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.variant === variantMode);
        });
    }

    // --- Seeded PRNG (simple mulberry32) for deterministic noise per pixel ---
    function mulberry32(a) {
        return function() {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // --- Render the profile picture onto a canvas at a given size ---
    function renderToCanvas(canvas, size) {
        const c = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;

        c.imageSmoothingEnabled = false;

        const { r, g, b } = hexToRgb(themeColor);
        const intensity = noiseIntensity / 100;

        // Use an offscreen 20x20 canvas for pixel-perfect work
        const offscreen = document.createElement('canvas');
        offscreen.width = 20;
        offscreen.height = 20;
        const oc = offscreen.getContext('2d');

        // Draw noisy background pixel by pixel
        const imgData = oc.createImageData(20, 20);
        const rng = mulberry32(42); // fixed seed for consistent pattern
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                const i = (y * 20 + x) * 4;
                // Random noise offset per pixel
                const noise = (rng() - 0.5) * 2 * intensity * 80;
                imgData.data[i]     = Math.max(0, Math.min(255, r + noise));
                imgData.data[i + 1] = Math.max(0, Math.min(255, g + noise));
                imgData.data[i + 2] = Math.max(0, Math.min(255, b + noise));
                imgData.data[i + 3] = 255;
            }
        }
        oc.putImageData(imgData, 0, 0);

        // Overlay the character sprite
        const baseImg = resolvedVariant === 'dark' ? baseDark : baseLight;
        if (baseImg.complete && baseImg.naturalWidth > 0) {
            oc.drawImage(baseImg, 0, 0, 20, 20);
        }

        // Scale up to target size with nearest-neighbor
        c.imageSmoothingEnabled = false;
        c.drawImage(offscreen, 0, 0, size, size);
    }

    // --- Render preview ---
    function render() {
        resolveVariant();
        renderToCanvas(previewCanvas, 200);
    }

    // --- Derive a clean brand slug from the input ---
    function getBrandSlug() {
        const query = brandInput.value.trim();
        if (!query) return '';
        // Strip TLD (.com, .co.uk, etc.) and common prefixes
        return query
            .replace(/^(https?:\/\/)?(www\.)?/i, '')
            .replace(/\.[a-z.]{2,}$/i, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase();
    }

    // --- Download helper ---
    function download(size) {
        resolveVariant();
        const offCanvas = document.createElement('canvas');
        renderToCanvas(offCanvas, size);
        const link = document.createElement('a');
        const slug = brandName || getBrandSlug();
        link.download = slug ? `${slug}.png` : `pfp_${size}x${size}.png`;
        link.href = offCanvas.toDataURL('image/png');
        link.click();
    }

    // --- Event: variant buttons ---
    variantBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            variantMode = btn.dataset.variant;
            updateVariantUI();
            render();
        });
    });

    // --- Event: color picker ---
    colorPicker.addEventListener('input', (e) => {
        themeColor = e.target.value;
        colorHex.value = themeColor;
        brandName = '';
        render();
    });

    // --- Event: hex input ---
    colorHex.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            themeColor = val;
            colorPicker.value = val;
            brandName = '';
            render();
        }
    });

    // --- Event: noise slider ---
    noiseSlider.addEventListener('input', (e) => {
        noiseIntensity = parseInt(e.target.value);
        noiseValue.textContent = noiseIntensity + '%';
        render();
    });

    // --- Event: download buttons ---
    dlOriginal.addEventListener('click', () => download(20));
    dl1000.addEventListener('click', () => download(1000));
    dlCustom.addEventListener('click', () => {
        const size = Math.max(20, Math.min(4096, parseInt(customSizeInput.value) || 512));
        download(size);
    });

    // --- API key management ---
    const API_KEY_STORAGE = 'pfpgen_branddev_key';

    function getApiKey() {
        return localStorage.getItem(API_KEY_STORAGE) || '';
    }

    // Load saved key into input
    apiKeyInput.value = getApiKey();

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem(API_KEY_STORAGE, key);
            setBrandStatus('Key saved', 'success');
        } else {
            localStorage.removeItem(API_KEY_STORAGE);
            setBrandStatus('Key removed', 'success');
        }
    });

    // --- Brand status helper ---
    function setBrandStatus(msg, type) {
        brandStatus.textContent = msg;
        brandStatus.className = type || '';
    }

    // --- Render color swatches ---
    function renderColorSwatches(colors, selectedHex) {
        brandColors.innerHTML = '';
        if (!colors || colors.length <= 1) return;

        colors.forEach(c => {
            const hex = c.hex.startsWith('#') ? c.hex : '#' + c.hex;
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch' + (hex.toLowerCase() === selectedHex.toLowerCase() ? ' active' : '');
            swatch.style.backgroundColor = hex;
            swatch.title = `${c.name || ''} ${hex}`.trim();
            swatch.addEventListener('click', () => {
                setColor(hex);
                // Update active state
                brandColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                const colorName = c.name || hex;
                setBrandStatus(`${brandStatus.dataset.brandTitle || ''} → ${colorName} (${hex})`.replace(/^\s*→\s*/, ''), 'success');
            });
            brandColors.appendChild(swatch);
        });
    }

    // --- Set color from external source ---
    function setColor(hex) {
        themeColor = hex;
        colorPicker.value = hex;
        colorHex.value = hex;
        render();
    }

    // --- Brand fetch logic ---
    async function fetchBrand() {
        const key = getApiKey();
        if (!key) {
            setBrandStatus('Set your brand.dev API key below first', 'error');
            document.getElementById('api-settings').open = true;
            return;
        }

        const query = brandInput.value.trim();
        if (!query) {
            setBrandStatus('Enter a brand name or domain', 'error');
            return;
        }

        setBrandStatus('Fetching…', 'loading');
        brandFetchBtn.disabled = true;

        try {
            // Detect if input looks like a domain
            const isDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(query);
            const endpoint = isDomain
                ? `https://api.brand.dev/v1/brand/retrieve?domain=${encodeURIComponent(query)}&fast=true`
                : `https://api.brand.dev/v1/brand/retrieve?name=${encodeURIComponent(query)}&fast=true`;

            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${key}` }
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                if (res.status === 401) {
                    setBrandStatus('Invalid API key', 'error');
                } else if (res.status === 404) {
                    setBrandStatus('Brand not found', 'error');
                } else {
                    setBrandStatus(`Error ${res.status}`, 'error');
                }
                return;
            }

            const data = await res.json();
            const colors = data?.brand?.colors;

            if (!colors || colors.length === 0) {
                setBrandStatus('No colors found for this brand', 'error');
                return;
            }

            // Use the first color as the primary theme color
            const primary = colors[0].hex;
            const primaryHex = primary.startsWith('#') ? primary : '#' + primary;
            setColor(primaryHex);

            const resolvedName = data?.brand?.title || query;
            // Store clean brand name for download filename
            brandName = resolvedName
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase();
            const colorName = colors[0].name || primary;
            brandStatus.dataset.brandTitle = resolvedName;
            setBrandStatus(`${resolvedName} → ${colorName} (${primary})`, 'success');

            // Show all colors as clickable swatches
            renderColorSwatches(colors, primaryHex);

        } catch (err) {
            setBrandStatus('Network error — check console', 'error');
            console.error('brand.dev fetch error:', err);
        } finally {
            brandFetchBtn.disabled = false;
        }
    }

    brandFetchBtn.addEventListener('click', fetchBrand);
    brandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchBrand();
    });

    // --- Initial render ---
    render();
})();
