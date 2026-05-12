export type ModerationSubject = "image" | "text" | "username";
export type ModerationLayer = "client" | "server";

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string; ruleId?: string };

export type ImageModerationInput = {
  fileSize?: number | null;
  mimeType?: string | null;
};

export type ModerationInputMap = {
  image: ImageModerationInput;
  text: string;
  username: string;
};

export type ModerationRule<T> = {
  id: string;
  appliesTo: ModerationSubject;
  layers: ModerationLayer[];
  evaluate: (input: T) => ModerationResult;
};

export type ModerationRequest<T extends ModerationSubject = ModerationSubject> = {
  subject: T;
  input: ModerationInputMap[T];
};

export type ModerationPolicy = {
  image: {
    maxBytes: number;
    allowedMimeTypes: string[];
  };
  text: {
    maxLength: number;
    blockLinks: boolean;
    repeatedCharacterLimit: number;
  };
  username: {
    minLength: number;
    maxLength: number;
    pattern: RegExp;
  };
};

export const MODERATION_POLICY: ModerationPolicy = {
  image: {
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  },
  text: {
    maxLength: 2000,
    blockLinks: true,
    repeatedCharacterLimit: 10,
  },
  username: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_.-]+$/,
  },
};

const MODERATION_RULES: {
  [K in ModerationSubject]: ModerationRule<ModerationInputMap[K]>[];
} = {
  image: [
    {
      id: "image.max_bytes",
      appliesTo: "image",
      layers: ["client", "server"],
      evaluate: (asset) => {
        if (
          asset.fileSize != null &&
          asset.fileSize > MODERATION_POLICY.image.maxBytes
        ) {
          const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
          return {
            ok: false,
            reason: `Photo is too large (${mb} MB). Please choose one under 10 MB.`,
            ruleId: "image.max_bytes",
          };
        }

        return { ok: true };
      },
    },
    {
      id: "image.mime_type",
      appliesTo: "image",
      layers: ["client", "server"],
      evaluate: (asset) => {
        if (
          asset.mimeType &&
          !MODERATION_POLICY.image.allowedMimeTypes.includes(
            asset.mimeType.toLowerCase()
          )
        ) {
          return {
            ok: false,
            reason: "Only JPEG, PNG, WebP, and HEIC photos are supported.",
            ruleId: "image.mime_type",
          };
        }

        return { ok: true };
      },
    },
  ],
  text: [
    {
      id: "text.max_length",
      appliesTo: "text",
      layers: ["client", "server"],
      evaluate: (text) => {
        const value = text.trim();
        if (!value) return { ok: true };

        if (value.length > MODERATION_POLICY.text.maxLength) {
          return {
            ok: false,
            reason: `Text is too long (${value.length} characters). Please keep it under ${MODERATION_POLICY.text.maxLength}.`,
            ruleId: "text.max_length",
          };
        }

        return { ok: true };
      },
    },
    {
      id: "text.links",
      appliesTo: "text",
      layers: ["client", "server"],
      evaluate: (text) => {
        const value = text.trim();
        if (!value || !MODERATION_POLICY.text.blockLinks) return { ok: true };

        if (/https?:\/\//i.test(value) || /\bwww\./i.test(value)) {
          return {
            ok: false,
            reason: "Links are not allowed in this field.",
            ruleId: "text.links",
          };
        }

        return { ok: true };
      },
    },
    {
      id: "text.repeated_characters",
      appliesTo: "text",
      layers: ["client", "server"],
      evaluate: (text) => {
        const value = text.trim();
        if (!value) return { ok: true };

        const repeatThreshold =
          MODERATION_POLICY.text.repeatedCharacterLimit - 1;
        const repeatedCharacterPattern = new RegExp(`(.)\\1{${repeatThreshold},}`);
        if (repeatedCharacterPattern.test(value)) {
          return {
            ok: false,
            reason: "Please enter a meaningful value.",
            ruleId: "text.repeated_characters",
          };
        }

        return { ok: true };
      },
    },
  ],
  username: [
    {
      id: "username.min_length",
      appliesTo: "username",
      layers: ["client", "server"],
      evaluate: (username) => {
        const value = username.trim();

        if (value.length < MODERATION_POLICY.username.minLength) {
          return {
            ok: false,
            reason: `Username must be at least ${MODERATION_POLICY.username.minLength} characters.`,
            ruleId: "username.min_length",
          };
        }

        return { ok: true };
      },
    },
    {
      id: "username.max_length",
      appliesTo: "username",
      layers: ["client", "server"],
      evaluate: (username) => {
        const value = username.trim();

        if (value.length > MODERATION_POLICY.username.maxLength) {
          return {
            ok: false,
            reason: `Username must be ${MODERATION_POLICY.username.maxLength} characters or fewer.`,
            ruleId: "username.max_length",
          };
        }

        return { ok: true };
      },
    },
    {
      id: "username.pattern",
      appliesTo: "username",
      layers: ["client", "server"],
      evaluate: (username) => {
        const value = username.trim();

        if (!MODERATION_POLICY.username.pattern.test(value)) {
          return {
            ok: false,
            reason:
              "Username can only contain letters, numbers, underscores, dashes, and dots.",
            ruleId: "username.pattern",
          };
        }

        return { ok: true };
      },
    },
  ],
};

export function getModerationRules<T extends ModerationSubject>(
  subject: T,
  layer: ModerationLayer = "client"
): ModerationRule<ModerationInputMap[T]>[] {
  return MODERATION_RULES[subject].filter((rule) =>
    rule.layers.includes(layer)
  ) as ModerationRule<ModerationInputMap[T]>[];
}

export function evaluateModerationRequest<T extends ModerationSubject>(
  request: ModerationRequest<T>,
  layer: ModerationLayer = "client"
): ModerationResult {
  const rules = getModerationRules(request.subject, layer);

  for (const rule of rules) {
    const result = rule.evaluate(request.input);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function buildModerationEnvelope<T extends ModerationSubject>(
  request: ModerationRequest<T>
) {
  return {
    subject: request.subject,
    input: request.input,
    policy: MODERATION_POLICY,
  };
}
