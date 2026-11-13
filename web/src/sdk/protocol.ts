
export type PhoneEndpoint =
    | 'SetPopUp' | 'SetContextMenu' | 'SetContactModal' | 'ShowComponent' | 'GetSettings' | 'GetLocale'
    | 'SendNotification' | 'CreateCall' | 'toggleInput' | 'OpenMedia' | 'GetPhoneNumber' | 'GetEmails'
    | 'SavePassword' | 'GetStorage' | 'SetStorage';

export type HostMessage =
    | { type: 'settingsUpdated'; settings: unknown }
    | { type: 'popUpInputChanged'; value: string }
    | { type: 'appOpen' | 'appClose'; data: { id?: string } };

export type PageMessage =
    | { type: 'sdphoneSdkReady' }
    | { type: 'sdphoneDebug'; message: string }
    | { type: 'sdphoneCloseApp' };
