if (!globalThis.componentsLoaded) {
    globalThis.componentsLoaded = true;

    globalThis.fetchNui = async (event, data, scriptName) => {
        scriptName = scriptName || globalThis.resourceName;

        if (scriptName !== globalThis.resourceName) {
            console.warn(`The app ${globalThis.appName} (${globalThis.resourceName}) is fetching from another resource (${scriptName}), this may be blocked by FiveM.`);
        }

        try {
            const response = await fetch(`https://${scriptName}/${event}`, {
                method: 'post',
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error(`${response.status} - ${response.statusText}`);

            return await response.json();
        } catch (err) {
            console.error(`Error fetching ${event} from ${scriptName}`, err);
        }
    };

    function onNuiEvent(eventName, cb) {
        window.addEventListener('message', (event) => {
            if (event.data?.action === eventName) {
                cb(event.data.data);
            }
        });
    }

    globalThis.useNuiEvent = onNuiEvent;

    let currentPopUpInputCb = null;

    function setPopUp(data) {
        currentPopUpInputCb = null;

        if (!data?.buttons) return;

        for (let i = 0; i < data.buttons.length; i++) {
            if (data.buttons[i].cb) data.buttons[i].callbackId = i;
        }

        if (data.input?.onChange) {
            currentPopUpInputCb = data.input.onChange;
            data.input.onChange = true;
        }

        globalThis.components.fetchPhone('SetPopUp', data).then((buttonId) => {
            if (!data.buttons[buttonId]?.cb) return;
            data.buttons[buttonId].cb();
        });
    }

    function setContextMenu(data) {
        if (!data?.buttons) return;

        for (let i = 0; i < data.buttons.length; i++) {
            if (data.buttons[i].cb) data.buttons[i].callbackId = i;
        }

        globalThis.components.fetchPhone('SetContextMenu', data).then((buttonId) => {
            if (!data.buttons[buttonId]?.cb) return;
            data.buttons[buttonId].cb();
        });
    }

    function setContactModal(number) {
        if (!number) return;

        globalThis.components.fetchPhone('SetContactModal', number);
    }

    function useComponent(cb, data) {
        if (!cb || !data?.component) return;

        globalThis.components
            .fetchPhone('ShowComponent', data)
            .then((result) => {
                cb(result);
            })
            .catch((err) => {
                console.log(err);
                cb(null);
            });
    }

    function selectGallery(data) {
        useComponent(data.cb, { ...data, component: 'gallery' });
    }

    function selectGIF(cb) {
        useComponent(cb, { component: 'gif' });
    }

    function selectEmoji(cb) {
        useComponent(cb, { component: 'emoji' });
    }

    function useCamera(cb, data) {
        useComponent(cb, { ...data, component: 'camera' });
    }

    function colorPicker(cb, data) {
        useComponent(cb, { ...data, customApp: true, component: 'colorpicker' });
    }

    function contactSelector(cb, data) {
        useComponent(cb, { ...data, component: 'contactselector' });
    }

    function getSettings() {
        return globalThis.components.fetchPhone('GetSettings');
    }

    function getLocale(path, format) {
        return globalThis.components.fetchPhone('GetLocale', { path, format });
    }

    function sendNotification(data) {
        data.app = globalThis.appIdentifier;
        if (!data?.title && !data?.content) return console.log('Invalid notification data');
        globalThis.components.fetchPhone('SendNotification', data);
    }

    let settingsListeners = [];

    function onSettingsChange(cb) {
        if (!cb) return;

        settingsListeners.push(cb);
    }

    function removeSettingsChangeListener(cb) {
        settingsListeners = settingsListeners.filter((listener) => listener !== cb);
    }

    globalThis.addEventListener('message', (event) => {
        const data = event.data;
        const type = data?.type;

        if (type === 'settingsUpdated') {
            settingsListeners.forEach((cb) => cb(data.settings));
        } else if (type === 'popUpInputChanged') {
            if (currentPopUpInputCb) currentPopUpInputCb(data.value);
        }
    });

    function toggleInput(toggle) {
        globalThis.components.fetchPhone('toggleInput', toggle);
    }

    let addedHandlers = [];

    function refreshInputs(inputs) {
        inputs.forEach((input) => {
            if (input.type === 'range') return;
            if (addedHandlers.includes(input)) return;

            addedHandlers.push(input);
            input.addEventListener('focus', () => toggleInput(true));
            input.addEventListener('blur', () => toggleInput(false));
        });
    }

    refreshInputs(document.querySelectorAll('input, textarea'));

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.childNodes && node.childNodes.length > 0) refreshInputs(node.querySelectorAll('input, textarea'));
                if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') refreshInputs([node]);
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    function createCall(data) {
        globalThis.components.fetchPhone('CreateCall', data);
    }

    function openMedia(data) {
        globalThis.components.fetchPhone('OpenMedia', typeof data === 'string' ? { src: data } : data);
    }

    globalThis.SetPopUp = setPopUp;
    globalThis.SetContextMenu = setContextMenu;
    globalThis.SetContactModal = setContactModal;
    globalThis.UseComponent = useComponent;
    globalThis.SelectGallery = selectGallery;
    globalThis.SelectGIF = selectGIF;
    globalThis.SelectEmoji = selectEmoji;
    globalThis.UseCamera = useCamera;
    globalThis.ColorPicker = colorPicker;
    globalThis.ContactSelector = contactSelector;
    globalThis.GetSettings = getSettings;
    globalThis.GetLocale = getLocale;
    globalThis.SendNotification = sendNotification;
    globalThis.OnSettingsChange = onSettingsChange;
    globalThis.RemoveSettingsChangeListener = removeSettingsChangeListener;
    globalThis.ToggleInput = toggleInput;
    globalThis.CreateCall = createCall;
    globalThis.OpenMedia = openMedia;

    globalThis.setPopUp = setPopUp;
    globalThis.setContextMenu = setContextMenu;
    globalThis.setContactModal = setContactModal;
    globalThis.useComponent = useComponent;
    globalThis.selectGallery = selectGallery;
    globalThis.selectGIF = selectGIF;
    globalThis.selectGif = selectGIF;
    globalThis.selectEmoji = selectEmoji;
    globalThis.useCamera = useCamera;
    globalThis.colorPicker = colorPicker;
    globalThis.contactSelector = contactSelector;
    globalThis.getSettings = getSettings;
    globalThis.getLocale = getLocale;
    globalThis.sendNotification = sendNotification;
    globalThis.onSettingsChange = onSettingsChange;
    globalThis.removeSettingsChangeListener = removeSettingsChangeListener;
    globalThis.toggleInput = toggleInput;
    globalThis.createCall = createCall;
    globalThis.openMedia = openMedia;
    globalThis.onNuiEvent = onNuiEvent;

    globalThis.postMessage('componentsLoaded', '*');
}
