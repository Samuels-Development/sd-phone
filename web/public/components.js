(function () {
    'use strict';

    if (globalThis.componentsLoaded) return;

    const settingsListeners = new Set();
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

    async function fetchNui(event, data, scriptName) {
        const target = scriptName || globalThis.resourceName;

        if (scriptName && scriptName !== globalThis.resourceName) {
            console.warn(
                `[${appLabel()}] app "${globalThis.appName}" belongs to resource "${globalThis.resourceName}" `
                + `but addressed "${scriptName}". FiveM may block the request.`,
            );
        }

        try {
            const response = await fetch(`https://${target}/${event}`, {
                method:  'post',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body:    JSON.stringify(data === undefined ? {} : data),
            });

            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

            return await response.json();
        } catch (err) {
            console.error(`[fetchNui] ${target}/${event} failed:`, err);
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
        const message = event.data;
        if (!message || typeof message !== 'object') return;

        if (message.type === 'settingsUpdated') {
            if (message.settings) globalThis.settings = message.settings;
            notifyAll(settingsListeners, message.settings, 'onSettingsChange');
        } else if (message.type === 'popUpInputChanged' && popUpInput) {
            popUpInput(message.value);
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
            runCallback(buttons, index);
        });
    }

    function openContextMenu(data) {
        const buttons = data && data.buttons;
        if (!Array.isArray(buttons)) return undefined;

        tagCallbacks(buttons);

        return callPhone('SetContextMenu', data).then(function (index) {
            runCallback(buttons, index);
        });
    }

    function openContactModal(number) {
        return callPhone('SetContactModal', number);
    }

    function showComponent(cb, data) {
        const done = typeof cb === 'function' ? cb : null;

        return callPhone('ShowComponent', data).then(
            function (result) {
                if (done) done(result === undefined ? null : result);
            },
            function (err) {
                console.error(`[useComponent] "${data && data.component}" failed:`, err);
                if (done) done(null);
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
    };

    Object.keys(API).forEach(function (name) {
        globalThis[name] = API[name];
        globalThis[name.charAt(0).toLowerCase() + name.slice(1)] = API[name];
    });

    globalThis.selectGif   = API.SelectGIF;
    globalThis.fetchNui    = fetchNui;
    globalThis.onNuiEvent  = subscribeNuiEvent;
    globalThis.useNuiEvent = subscribeNuiEvent;

    globalThis.addEventListener('message', handleMessage);

    const boundFields = new WeakSet();

    function onFieldFocus() {
        captureKeyboard(true);
    }

    function onFieldBlur() {
        captureKeyboard(false);
    }

    function bindField(field) {
        if (field.type === 'range') return;
        if (boundFields.has(field)) return;

        boundFields.add(field);
        field.addEventListener('focus', onFieldFocus);
        field.addEventListener('blur', onFieldBlur);
    }

    function bindFieldsWithin(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.matches('input, textarea')) bindField(node);
        node.querySelectorAll('input, textarea').forEach(bindField);
    }

    const appRoot = document.body || document.documentElement;

    bindFieldsWithin(appRoot);

    new MutationObserver(function (records) {
        records.forEach(function (record) {
            record.addedNodes.forEach(bindFieldsWithin);
        });
    }).observe(appRoot, { childList: true, subtree: true });

    globalThis.componentsLoaded = true;

    globalThis.postMessage('componentsLoaded', '*');
})();
