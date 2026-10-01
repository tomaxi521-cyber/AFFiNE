import type { ComponentType } from 'react';

import CONFIG_DESCRIPTORS from '../../config.json';
import type { ConfigInputProps } from './config-input-row';
import { AuthSigningKeys } from './operations/auth-signing-keys';
import { SendTestEmail } from './operations/send-test-email';
export type ConfigType = 'String' | 'Number' | 'Boolean' | 'JSON' | 'Enum';

type ConfigDescriptor = {
  desc: string;
  type: ConfigType;
  env?: string;
  link?: string;
};

export type AppConfig = Record<string, Record<string, any>>;

type AppConfigDescriptors = typeof CONFIG_DESCRIPTORS;
type AppConfigModule = keyof AppConfigDescriptors;
type ModuleConfigDescriptors<M extends AppConfigModule> =
  AppConfigDescriptors[M];
type ConfigGroup<T extends AppConfigModule> = {
  name: string;
  module: T;
  fields: Array<
    | keyof ModuleConfigDescriptors<T>
    | ({
        key: keyof ModuleConfigDescriptors<T>;
        sub?: string;
        desc?: string;
      } & Partial<ConfigInputProps>)
  >;
  operations?: ComponentType<{
    appConfig: AppConfig;
  }>[];
};
const IGNORED_MODULES: (keyof AppConfig)[] = [];

if (environment.isSelfHosted) {
  IGNORED_MODULES.push('payment', 'captcha', 'telemetry', 'metrics');
}

const ALL_CONFIGURABLE_MODULES = Object.keys(CONFIG_DESCRIPTORS).filter(
  key => !IGNORED_MODULES.includes(key as keyof AppConfig)
);

export const KNOWN_CONFIG_GROUPS = [
  {
    name: '服务器',
    module: 'server',
    fields: ['externalUrl', 'name', 'hosts'],
  } as ConfigGroup<'server'>,
  {
    name: '身份验证',
    module: 'auth',
    fields: [
      'allowSignup',
      'allowSignupForOauth',
      {
        key: 'newAccountShareActionDelay',
        type: 'Number',
        desc: '新账户邀请成员或创建分享链接前所需的最短注册时长（秒）。',
      },
      // nested json object
      {
        key: 'passwordRequirements',
        sub: 'min',
        type: 'Number',
        desc: '密码最小长度要求',
      },
      {
        key: 'passwordRequirements',
        sub: 'max',
        type: 'Number',
        desc: '密码最大长度要求',
      },
    ],
    operations: [AuthSigningKeys],
  } as ConfigGroup<'auth'>,
  {
    name: '通知',
    module: 'mailer',
    fields: [
      'SMTP.name',
      'SMTP.host',
      'SMTP.port',
      'SMTP.username',
      'SMTP.password',
      'SMTP.ignoreTLS',
      'SMTP.sender',
    ],
    operations: [SendTestEmail],
  } as ConfigGroup<'mailer'>,
  {
    name: '存储',
    module: 'storages',
    fields: [
      {
        key: 'blob.storage',
        desc: '用户上传文件的存储提供方',
        sub: 'provider',
        type: 'Enum',
        options: ['fs', 'aws-s3', 'cloudflare-r2'],
      },
      {
        key: 'blob.storage',
        sub: 'bucket',
        type: 'String',
        desc: '用户上传文件的存储桶名称',
      },
      {
        key: 'blob.storage',
        sub: 'config',
        type: 'JSON',
        desc: '存储提供方的 S3 兼容配置（endpoint/region/credentials）。',
      },
      {
        key: 'avatar.storage',
        desc: '用户头像的存储提供方',
        sub: 'provider',
        type: 'Enum',
        options: ['fs', 'aws-s3', 'cloudflare-r2'],
      },
      {
        key: 'avatar.storage',
        sub: 'bucket',
        type: 'String',
        desc: '用户头像的存储桶名称',
      },
      {
        key: 'avatar.storage',
        sub: 'config',
        type: 'JSON',
        desc: '存储提供方的 S3 兼容配置（endpoint/region/credentials）。',
      },
      {
        key: 'avatar.publicPath',
        type: 'String',
        desc: '用户头像的公共路径前缀（例如 https://my-bucket.s3.amazonaws.com/）',
      },
    ],
  } as ConfigGroup<'storages'>,
  {
    name: 'OAuth',
    module: 'oauth',
    fields: ['providers.google', 'providers.github', 'providers.oidc'],
  } as ConfigGroup<'oauth'>,
  {
    name: 'AI BYOK',
    module: 'copilot',
    fields: [
      {
        key: 'enabled',
        desc: '启用 AI 功能。工作区所有者可在「工作区设置 → 集成 → AI BYOK」中配置提供方密钥。',
      },
      'byok.enabled',
      'byok.allowedProviders',
      'byok.allowCustomEndpoint',
      {
        key: 'byok.allowPrivateEndpoint',
        desc: '允许工作区所有者和管理员连接私有网络端点上的 BYOK 提供方。仅对可信工作区启用此选项。',
      },
    ],
  } as ConfigGroup<'copilot'>,
];

const MODULE_LABELS: Record<string, string> = {
  metrics: '指标',
  crypto: '加密',
  job: '任务队列',
  throttle: '请求限流',
  doc: '文档',
  websocket: 'WebSocket',
  flags: '功能开关',
  docService: '文档服务',
  telemetry: '遥测',
  client: '客户端',
  calendar: '日历',
  captcha: '验证码',
  indexer: '索引',
  payment: '支付',
  worker: '工作进程',
};

export const UNKNOWN_CONFIG_GROUPS = ALL_CONFIGURABLE_MODULES.filter(
  module => !KNOWN_CONFIG_GROUPS.some(group => group.module === module)
).map(module => ({
  name: MODULE_LABELS[module] ?? module,
  module,
  // @ts-expect-error allow
  fields: Object.keys(CONFIG_DESCRIPTORS[module]),
  operations: undefined,
}));

export const ALL_SETTING_GROUPS = [
  ...KNOWN_CONFIG_GROUPS,
  ...UNKNOWN_CONFIG_GROUPS,
];

export const ALL_CONFIG_DESCRIPTORS = CONFIG_DESCRIPTORS as Record<
  string,
  Record<string, ConfigDescriptor>
>;
