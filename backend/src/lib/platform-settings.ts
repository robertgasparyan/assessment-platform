import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

const REPORT_EMAIL_DELIVERY_KEY = "report_email_delivery";
const SMTP_CONFIGURATION_KEY = "smtp_configuration";
const APPLICATION_BRANDING_KEY = "application_branding";
const NAVIGATION_SEARCH_KEY = "navigation_search";
const DEFAULT_APPLICATION_TITLE = "Assessment Platform";

type ReportEmailDeliverySettingValue = {
  enabled?: boolean;
};

type SmtpConfigurationSettingValue = {
  host?: string;
  port?: number;
  from?: string;
};

type ApplicationBrandingSettingValue = {
  applicationTitle?: string;
};

type NavigationSearchSettingValue = {
  enabled?: boolean;
};

function readEnabledFlag(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (value as ReportEmailDeliverySettingValue).enabled === true;
}

function readSmtpOverrides(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      host: "",
      port: null as number | null
    };
  }

  const typed = value as SmtpConfigurationSettingValue;
  return {
    host: typed.host?.trim() ?? "",
    port: typeof typed.port === "number" && Number.isFinite(typed.port) ? typed.port : null,
    from: typed.from?.trim() ?? ""
  };
}

function readApplicationBranding(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      applicationTitle: DEFAULT_APPLICATION_TITLE
    };
  }

  const typed = value as ApplicationBrandingSettingValue;
  return {
    applicationTitle: typed.applicationTitle?.trim() || DEFAULT_APPLICATION_TITLE
  };
}

function readNavigationSearch(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      enabled: true
    };
  }

  const typed = value as NavigationSearchSettingValue;
  return {
    enabled: typed.enabled !== false
  };
}

export async function getApplicationBrandingSettings() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: APPLICATION_BRANDING_KEY }
  });
  const branding = readApplicationBranding(setting?.value);

  return {
    applicationTitle: branding.applicationTitle,
    source: branding.applicationTitle === DEFAULT_APPLICATION_TITLE ? "default" : "admin"
  } as const;
}

export async function getNavigationSearchSettings() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: NAVIGATION_SEARCH_KEY }
  });
  const navigationSearch = readNavigationSearch(setting?.value);

  return {
    enabled: navigationSearch.enabled
  };
}

export async function getEffectiveSmtpConfiguration() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: SMTP_CONFIGURATION_KEY }
  });
  const overrides = readSmtpOverrides(setting?.value);

  return {
    host: overrides.host || config.smtp.host,
    port: overrides.port ?? config.smtp.port,
    from: overrides.from || config.smtp.from,
    user: config.smtp.user,
    pass: config.smtp.pass
  };
}

export async function getSmtpConfigurationSummary() {
  const effective = await getEffectiveSmtpConfiguration();

  return {
    host: effective.host,
    port: effective.port,
    from: effective.from,
    hasUser: Boolean(config.smtp.user.trim()),
    hasPassword: Boolean(config.smtp.pass),
    source: {
      host: effective.host === config.smtp.host ? "env" : "admin",
      port: effective.port === config.smtp.port ? "env" : "admin",
      from: effective.from === config.smtp.from ? "env" : "admin"
    }
  };
}

export async function isSmtpConfigured() {
  const effective = await getEffectiveSmtpConfiguration();
  return Boolean(effective.host.trim() && Number.isFinite(effective.port) && effective.from.trim());
}

export async function getReportEmailDeliverySettings() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: REPORT_EMAIL_DELIVERY_KEY }
  });

  const enabled = readEnabledFlag(setting?.value);
  const configured = await isSmtpConfigured();
  const smtp = await getSmtpConfigurationSummary();

  return {
    enabled,
    configured,
    available: enabled && configured,
    smtp
  };
}

export async function updateReportEmailDeliverySettings(enabled: boolean) {
  const value = {
    enabled
  } satisfies ReportEmailDeliverySettingValue;

  await prisma.platformSetting.upsert({
    where: { key: REPORT_EMAIL_DELIVERY_KEY },
    create: {
      key: REPORT_EMAIL_DELIVERY_KEY,
      value: value as Prisma.InputJsonValue
    },
    update: {
      value: value as Prisma.InputJsonValue
    }
  });

  return getReportEmailDeliverySettings();
}

export async function updateSmtpConfiguration({
  host,
  port,
  from
}: {
  host: string;
  port: number;
  from: string;
}) {
  const value = {
    host: host.trim(),
    port,
    from: from.trim()
  } satisfies SmtpConfigurationSettingValue;

  await prisma.platformSetting.upsert({
    where: { key: SMTP_CONFIGURATION_KEY },
    create: {
      key: SMTP_CONFIGURATION_KEY,
      value: value as Prisma.InputJsonValue
    },
    update: {
      value: value as Prisma.InputJsonValue
    }
  });

  return getReportEmailDeliverySettings();
}

export async function updateApplicationBrandingSettings(applicationTitle: string) {
  const normalizedTitle = applicationTitle.trim() || DEFAULT_APPLICATION_TITLE;
  const value = {
    applicationTitle: normalizedTitle
  } satisfies ApplicationBrandingSettingValue;

  await prisma.platformSetting.upsert({
    where: { key: APPLICATION_BRANDING_KEY },
    create: {
      key: APPLICATION_BRANDING_KEY,
      value: value as Prisma.InputJsonValue
    },
    update: {
      value: value as Prisma.InputJsonValue
    }
  });

  return getApplicationBrandingSettings();
}

export async function updateNavigationSearchSettings(enabled: boolean) {
  const value = {
    enabled
  } satisfies NavigationSearchSettingValue;

  await prisma.platformSetting.upsert({
    where: { key: NAVIGATION_SEARCH_KEY },
    create: {
      key: NAVIGATION_SEARCH_KEY,
      value: value as Prisma.InputJsonValue
    },
    update: {
      value: value as Prisma.InputJsonValue
    }
  });

  return getNavigationSearchSettings();
}
