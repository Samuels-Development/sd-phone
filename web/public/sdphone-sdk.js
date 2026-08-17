(function () {
    'use strict';

    if (globalThis.componentsLoaded) return;

    const settingsListeners = new Set();
    const openListeners     = new Set();
    const closeListeners    = new Set();
    const nuiListeners      = new Map();
    const quietEndpoints    = new Set();

    let popUpInput = null;

    function appLabel() {
        return globalThis.appName || globalThis.appIdentifier || 'custom app';
    }

    function notifyAll(listeners, value, label) {
        listeners.forEach(function (listener) {
            try {
                listener(value);
            } catch (err) {
                console.error(`[${label}] listener threw:`, err);
            }
        });
    }

    function callPhone(endpoint, payload) {
        const bridge = globalThis.components;

        if (!bridge || typeof bridge.fetchPhone !== 'function') {
            if (!quietEndpoints.has(endpoint)) {
                quietEndpoints.add(endpoint);
                console.warn(`[${appLabel()}] no phone bridge for "${endpoint}"; the call was dropped.`);
            }
            return Promise.resolve(undefined);
        }

        try {
            return Promise.resolve(bridge.fetchPhone(endpoint, payload));
        } catch (err) {
            console.error(`[${appLabel()}] phone call "${endpoint}" failed:`, err);
            return Promise.resolve(undefined);
        }
    }

    async function fetchNuiStrict(event, data, scriptName) {
        const target = scriptName || globalThis.resourceName;

        if (scriptName && scriptName !== globalThis.resourceName) {
            console.warn(
                `[${appLabel()}] app "${globalThis.appName}" belongs to resource "${globalThis.resourceName}" `
                + `but addressed "${scriptName}". FiveM may block the request.`,
            );
        }

        const response = await fetch(`https://${target}/${event}`, {
            method:  'post',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body:    JSON.stringify(data === undefined ? {} : data),
        });

        if (!response.ok) throw new Error(`${target}/${event}: ${response.status} ${response.statusText}`);

        return await response.json();
    }

    function reportDebug(message) {
        try {
            globalThis.parent.postMessage({ type: 'sdphoneDebug', message: String(message) }, '*');
        } catch (err) {
            void err;
        }
    }

    async function fetchNui(event, data, scriptName) {
        try {
            return await fetchNuiStrict(event, data, scriptName);
        } catch (err) {
            const reason = err && err.message ? err.message : err;
            console.error(`[fetchNui] ${reason}`);
            reportDebug(`${globalThis.appIdentifier || 'app'}: fetchNui "${event}" failed: ${reason}`);
            return undefined;
        }
    }

    function subscribeNuiEvent(eventName, cb) {
        if (!eventName || typeof cb !== 'function') return function () {};

        let subscribers = nuiListeners.get(eventName);
        if (!subscribers) {
            subscribers = new Set();
            nuiListeners.set(eventName, subscribers);
        }
        subscribers.add(cb);

        return function unsubscribe() {
            subscribers.delete(cb);
        };
    }

    function handleMessage(event) {
        if (event.source !== globalThis.parent && event.source !== globalThis) return;

        const message = event.data;
        if (!message || typeof message !== 'object') return;

        if (message.type === 'settingsUpdated') {
            if (message.settings) globalThis.settings = message.settings;
            notifyAll(settingsListeners, message.settings, 'onSettingsChange');
        } else if (message.type === 'popUpInputChanged' && popUpInput) {
            popUpInput(message.value);
        } else if (message.type === 'appOpen') {
            notifyAll(openListeners, message.data, 'onAppOpen');
        } else if (message.type === 'appClose') {
            notifyAll(closeListeners, message.data, 'onAppClose');
        }

        if (typeof message.action === 'string') {
            const subscribers = nuiListeners.get(message.action);
            if (subscribers) notifyAll(subscribers, message.data, message.action);
        }
    }

    function tagCallbacks(buttons) {
        buttons.forEach(function (button, index) {
            if (button && typeof button.cb === 'function') button.callbackId = index;
        });
    }

    function runCallback(buttons, index) {
        if (index === undefined || index === null) return;

        const button = buttons[index];
        if (button && typeof button.cb === 'function') button.cb();
    }

    function openPopUp(data) {
        const buttons = data && data.buttons;
        if (!Array.isArray(buttons)) return undefined;

        tagCallbacks(buttons);

        let payload = data;

        if (data.input && typeof data.input.onChange === 'function') {
            popUpInput = data.input.onChange;
            payload = Object.assign({}, data, { input: Object.assign({}, data.input, { onChange: true }) });
        } else {
            popUpInput = null;
        }

        return callPhone('SetPopUp', payload).then(function (index) {
            popUpInput = null;
            runCallback(buttons, index);
            return index;
        }, function (err) {
            popUpInput = null;
            console.error(`[${appLabel()}] pop-up failed:`, err);
            return undefined;
        });
    }

    function openContextMenu(data) {
        const buttons = data && data.buttons;
        if (!Array.isArray(buttons)) return undefined;

        tagCallbacks(buttons);

        return callPhone('SetContextMenu', data).then(function (index) {
            runCallback(buttons, index);
            return index;
        }, function (err) {
            console.error(`[${appLabel()}] context menu failed:`, err);
            return undefined;
        });
    }

    function openContactModal(number) {
        return callPhone('SetContactModal', number);
    }

    function showComponent(cb, data) {
        const done = typeof cb === 'function' ? cb : null;

        return callPhone('ShowComponent', data).then(
            function (result) {
                const value = result === undefined ? null : result;
                if (done) done(value);
                return value;
            },
            function (err) {
                console.error(`[useComponent] "${data && data.component}" failed:`, err);
                if (done) done(null);
                return null;
            },
        );
    }

    function pickFromGallery(data) {
        const options = Object.assign({}, data);
        const cb = options.cb;
        delete options.cb;

        return showComponent(cb, Object.assign(options, { component: 'gallery' }));
    }

    function pickGif(cb) {
        return showComponent(cb, { component: 'gif' });
    }

    function pickEmoji(cb) {
        return showComponent(cb, { component: 'emoji' });
    }

    function openCamera(cb, data) {
        return showComponent(cb, Object.assign({}, data, { component: 'camera' }));
    }

    function pickContact(cb, data) {
        return showComponent(cb, Object.assign({}, data, { component: 'contactselector' }));
    }

    function pickColour(cb, data) {
        return showComponent(cb, Object.assign({}, data, { component: 'colorpicker', customApp: true }));
    }

    function readSettings() {
        return callPhone('GetSettings');
    }

    function readLocale(path, format) {
        return callPhone('GetLocale', { path: path, format: format });
    }

    function pushNotification(data) {
        if (!data || (!data.title && !data.content)) {
            console.error('[sendNotification] invalid notification data: a title or content is required.', data);
            return undefined;
        }

        return callPhone('SendNotification', Object.assign({}, data, { app: globalThis.appIdentifier }));
    }

    function watchSettings(cb) {
        if (typeof cb !== 'function') return;
        settingsListeners.add(cb);
    }

    function unwatchSettings(cb) {
        settingsListeners.delete(cb);
    }

    function captureKeyboard(state) {
        return callPhone('toggleInput', !!state);
    }

    function startCall(data) {
        return callPhone('CreateCall', data);
    }

    function viewMedia(data) {
        return callPhone('OpenMedia', typeof data === 'string' ? { src: data } : data);
    }

    function readPhoneNumber() {
        return callPhone('GetPhoneNumber').then(function (n) {
            return typeof n === 'string' && n !== '' ? n : null;
        });
    }

    function readStorage(key, fallback) {
        if (typeof key !== 'string' || key === '') return Promise.resolve(fallback === undefined ? null : fallback);

        return callPhone('GetStorage', { key: key }).then(function (raw) {
            if (raw === undefined || raw === null) return fallback === undefined ? null : fallback;
            try {
                return JSON.parse(raw);
            } catch (err) {
                return fallback === undefined ? null : fallback;
            }
        });
    }

    function writeStorage(key, value) {
        if (typeof key !== 'string' || key === '') return Promise.resolve(false);

        if (value === undefined || value === null) {
            return callPhone('SetStorage', { key: key, value: null }).then(function (ok) { return ok === true; });
        }

        let encoded;
        try {
            encoded = JSON.stringify(value);
        } catch (err) {
            console.error(`[${appLabel()}] SetStorage("${key}") value is not serialisable:`, err);
            return Promise.resolve(false);
        }

        return callPhone('SetStorage', { key: key, value: encoded }).then(function (ok) { return ok === true; });
    }

    function confirmDialog(data) {
        const opts = typeof data === 'string' ? { title: data } : Object.assign({}, data || {});
        const cancelText = opts.cancelText || 'Cancel';
        const confirmText = opts.confirmText || 'Confirm';

        delete opts.cancelText;
        delete opts.confirmText;

        return openPopUp(Object.assign(opts, {
            buttons: [{ title: cancelText }, { title: confirmText, color: opts.color }],
        })).then(function (index) {
            return index === 1;
        });
    }

    function watchAppOpen(cb) {
        if (typeof cb !== 'function') return function () {};
        openListeners.add(cb);
        return function () { openListeners.delete(cb); };
    }

    function watchAppClose(cb) {
        if (typeof cb !== 'function') return function () {};
        closeListeners.add(cb);
        return function () { closeListeners.delete(cb); };
    }

    const API = {
        SetPopUp:                     openPopUp,
        SetContextMenu:               openContextMenu,
        SetContactModal:              openContactModal,
        UseComponent:                 showComponent,
        SelectGallery:                pickFromGallery,
        SelectGIF:                    pickGif,
        SelectEmoji:                  pickEmoji,
        UseCamera:                    openCamera,
        ColorPicker:                  pickColour,
        ContactSelector:              pickContact,
        GetSettings:                  readSettings,
        GetLocale:                    readLocale,
        SendNotification:             pushNotification,
        OnSettingsChange:             watchSettings,
        RemoveSettingsChangeListener: unwatchSettings,
        ToggleInput:                  captureKeyboard,
        CreateCall:                   startCall,
        OpenMedia:                    viewMedia,
        GetPhoneNumber:               readPhoneNumber,
        GetStorage:                   readStorage,
        SetStorage:                   writeStorage,
        ShowConfirm:                  confirmDialog,
        OnAppOpen:                    watchAppOpen,
        OnAppClose:                   watchAppClose,
    };

    Object.keys(API).forEach(function (name) {
        globalThis[name] = API[name];
        globalThis[name.charAt(0).toLowerCase() + name.slice(1)] = API[name];
    });

    globalThis.selectGif       = API.SelectGIF;
    globalThis.fetchNui        = fetchNui;
    globalThis.fetchNuiStrict  = fetchNuiStrict;
    globalThis.onNuiEvent      = subscribeNuiEvent;
    globalThis.useNuiEvent     = subscribeNuiEvent;

    globalThis.componentsVersion = 4;

    globalThis.componentsUnsupported = Object.freeze(['SetContactModal']);

    globalThis.componentsSupports = function (name) {
        if (typeof name !== 'string' || typeof globalThis[name] !== 'function') return false;
        return globalThis.componentsUnsupported.indexOf(name) === -1;
    };

    globalThis.addEventListener('message', handleMessage);

    const boundFields = new WeakSet();
    const TEXT_FIELDS = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
    const NON_TYPING = new Set([
        'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'image',
    ]);

    function onFieldFocus() {
        captureKeyboard(true);
    }

    function onFieldBlur() {
        captureKeyboard(false);
    }

    function bindField(field) {
        if (NON_TYPING.has(field.type)) return;
        if (boundFields.has(field)) return;

        boundFields.add(field);
        field.addEventListener('focus', onFieldFocus);
        field.addEventListener('blur', onFieldBlur);
    }

    function bindFieldsWithin(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.matches(TEXT_FIELDS)) bindField(node);
        node.querySelectorAll(TEXT_FIELDS).forEach(bindField);
    }

    const appRoot = document.body || document.documentElement;

    bindFieldsWithin(appRoot);

    new MutationObserver(function (records) {
        records.forEach(function (record) {
            if (record.type === 'attributes') {
                bindFieldsWithin(record.target);
                return;
            }
            record.addedNodes.forEach(bindFieldsWithin);
        });
    }).observe(appRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['contenteditable'],
    });

    globalThis.componentsLoaded = true;

    reportDebug(
        `${globalThis.appIdentifier || 'app'}: SDK v${globalThis.componentsVersion} ready in `
        + `"${globalThis.resourceName}", settings=${globalThis.settings ? 'yes' : 'no'}, `
        + `bridge=${globalThis.components ? 'yes' : 'no'}`,
    );

    globalThis.postMessage('componentsLoaded', '*');

    try {
        globalThis.parent.postMessage({ type: 'sdphoneSdkReady' }, '*');
    } catch (err) {
        void err;
    }
})();
