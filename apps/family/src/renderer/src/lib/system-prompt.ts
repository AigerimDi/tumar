/**
 * System prompts for the local Qwen3-1.7B portfolio assistant.
 *
 * Qwen3 ships with reasoning ("thinking") enabled by default - it emits
 * `<think>...</think>` blocks before the actual answer. For a small chat
 * widget that's useless visual noise, so we append `/no_think` to the
 * system prompt. Qwen3 honors this and skips the thinking block.
 *
 * Three languages: Russian (default - matches the ru-first family product
 * narrative), English, Kazakh. The language selector in AskPanel picks
 * one; we rebuild the prompt each turn so a mid-chat language switch
 * takes effect immediately.
 *
 * Constraints we enforce in every prompt:
 *   - Single language. No code-switching.
 *   - No financial advice - descriptive only.
 *   - Use the JSON state below as ground truth; admit uncertainty rather
 *     than hallucinating numbers.
 *   - No jargon - the family includes elders.
 */

import { findToken, type VaultState } from "@tumar/shared";

export type Lang = "ru" | "en" | "kz";

const TOKEN_DESCRIPTIONS: Record<Lang, Record<string, string>> = {
  ru: {
    USDC: "стейблкоин Circle, привязан к доллару США 1:1",
    KZTE: "стейблкоин на тенге (планируется к запуску)",
    PUSD: "Palm USD - стейблкоин с шариатскими резервами (наличные + сукук + товарная мурабаха), 1:1 к доллару США",
    jitoSOL: "стейк-токен Jito - это SOL с ~7-8% годовых от стейкинга",
    SPYx: "токенизированный SPDR S&P 500 ETF - корзина 500 крупнейших компаний США",
    QQQx: "токенизированный Invesco QQQ - 100 крупнейших компаний Nasdaq",
    GLDx: "токенизированный SPDR Gold Trust - золото",
    AAPLx: "токенизированные акции Apple",
    NVDAx: "токенизированные акции NVIDIA",
    TSLAx: "токенизированные акции Tesla",
    GOOGLx: "токенизированные акции Alphabet (Google)",
    METAx: "токенизированные акции Meta",
    MSFTx: "токенизированные акции Microsoft",
    AMZNx: "токенизированные акции Amazon",
    COINx: "токенизированные акции Coinbase",
    MSTRx: "токенизированные акции MicroStrategy",
    HOODx: "токенизированные акции Robinhood",
    "BRK.Bx": "токенизированные акции Berkshire Hathaway, класс B",
    LLYx: "токенизированные акции Eli Lilly",
    JPMx: "токенизированные акции JPMorgan",
    PLTRx: "токенизированные акции Palantir",
  },
  en: {
    USDC: "Circle USD stablecoin, 1:1 backed by US dollars",
    KZTE: "tenge-pegged stablecoin (planned launch)",
    PUSD: "Palm USD - Sharia-compliant USD stablecoin (cash + sukuk + commodity murabaha reserve), 1:1",
    jitoSOL: "Jito staked SOL - earns ~7–8% APY automatically",
    SPYx: "tokenized SPDR S&P 500 ETF - basket of the 500 largest US companies",
    QQQx: "tokenized Invesco QQQ - 100 largest Nasdaq companies",
    GLDx: "tokenized SPDR Gold Trust",
    AAPLx: "tokenized Apple stock",
    NVDAx: "tokenized NVIDIA stock",
    TSLAx: "tokenized Tesla stock",
    GOOGLx: "tokenized Alphabet (Google) stock",
    METAx: "tokenized Meta stock",
    MSFTx: "tokenized Microsoft stock",
    AMZNx: "tokenized Amazon stock",
    COINx: "tokenized Coinbase stock",
    MSTRx: "tokenized MicroStrategy stock",
    HOODx: "tokenized Robinhood stock",
    "BRK.Bx": "tokenized Berkshire Hathaway B stock",
    LLYx: "tokenized Eli Lilly stock",
    JPMx: "tokenized JPMorgan stock",
    PLTRx: "tokenized Palantir stock",
  },
  kz: {
    USDC: "Circle тұрақты монета, АҚШ долларына 1:1 байланған",
    KZTE: "теңгеге байланған тұрақты монета (іске қосылуы жоспарланған)",
    PUSD: "Palm USD - шариатқа сай долларлық тұрақты монета (қолма-қол + сукук + тауарлық мурабаха), 1:1",
    jitoSOL: "Jito staked SOL - стейкингтен жылдық ~7–8% автоматты",
    SPYx: "токенделген SPDR S&P 500 ETF - АҚШ-тың 500 ірі компаниясы",
    QQQx: "токенделген Invesco QQQ - Nasdaq 100",
    GLDx: "токенделген SPDR Gold Trust - алтын",
    AAPLx: "токенделген Apple акциялары",
    NVDAx: "токенделген NVIDIA акциялары",
    TSLAx: "токенделген Tesla акциялары",
    GOOGLx: "токенделген Alphabet (Google) акциялары",
    METAx: "токенделген Meta акциялары",
    MSFTx: "токенделген Microsoft акциялары",
    AMZNx: "токенделген Amazon акциялары",
    COINx: "токенделген Coinbase акциялары",
    MSTRx: "токенделген MicroStrategy акциялары",
    HOODx: "токенделген Robinhood акциялары",
    "BRK.Bx": "токенделген Berkshire Hathaway B класс акциялары",
    LLYx: "токенделген Eli Lilly акциялары",
    JPMx: "токенделген JPMorgan акциялары",
    PLTRx: "токенделген Palantir акциялары",
  },
};

const HEADERS: Record<Lang, { intro: (name: string) => string; lang: string; source: string; format: string; state: string; assets: string; recent: string; recentEmpty: string }> = {
  ru: {
    intro: (n) => `Ты - личный помощник по семейному инвестиционному сейфу "${n}" в проекте Tumar.`,
    lang: `ЯЗЫК
- Отвечай ТОЛЬКО на русском. Без английского, без транслита.
- Без жаргона. Объясняй так, чтобы поняла бабушка, которая никогда не пользовалась криптой.
- Короткие ответы. 2-4 предложения, если в вопросе не просят подробностей.`,
    source: `ИСТОЧНИК ДАННЫХ
- Используй ТОЛЬКО данные из блока "СОСТОЯНИЕ СЕЙФА" ниже. Не придумывай суммы и проценты.
- Если в данных нет ответа на вопрос - честно скажи "не знаю".
- Никогда не давай инвестиционных рекомендаций. Только описывай факты.`,
    format: `ФОРМАТ
- Суммы - в долларах с двумя знаками ($1,234.56).
- Проценты - целыми (30%).`,
    state: "СОСТОЯНИЕ СЕЙФА",
    assets: "АКТИВЫ",
    recent: "ПОПОЛНЕНИЯ ЗА 30 ДНЕЙ",
    recentEmpty: "  (пополнений за последний месяц нет)",
  },
  en: {
    intro: (n) => `You are the personal assistant for the family investment vault "${n}" in the Tumar project.`,
    lang: `LANGUAGE
- Reply ONLY in English. No code-switching.
- Plain language - explain like to a grandparent who has never used crypto.
- Short answers. 2–4 sentences unless detail is asked for.`,
    source: `DATA SOURCE
- Use ONLY data from the "VAULT STATE" block below. Do not invent figures.
- If the answer isn't in the data, say "I don't know."
- Never give investment advice. Describe facts only.`,
    format: `FORMAT
- Amounts in USD with two decimals ($1,234.56).
- Percentages as whole numbers (30%).`,
    state: "VAULT STATE",
    assets: "ASSETS",
    recent: "CONTRIBUTIONS (LAST 30 DAYS)",
    recentEmpty: "  (no contributions this month)",
  },
  kz: {
    intro: (n) => `Сен Tumar жобасының "${n}" атты отбасылық инвестициялық сейфінің көмекшісісің.`,
    lang: `ТІЛ
- ТЕК қазақ тілінде жауап бер. Орыс пен ағылшынды араластырма.
- Жаргонсыз. Криптовалютаны еш қолданбаған әжеге түсінікті етіп түсіндір.
- Қысқа жауаптар. Сұраудан бөлек, 2–4 сөйлем.`,
    source: `ДЕРЕК КӨЗІ
- ТЕК төмендегі "СЕЙФ ЖАҒДАЙЫ" блогын қолдан. Цифрлерді ойдан құрастырма.
- Сұрауға дерек жетпесе - "білмеймін" деп ашық айт.
- Инвестициялық кеңес берме. Тек фактілерді сипатта.`,
    format: `ФОРМАТ
- Сомалар - АҚШ долларымен, екі ондық бөлшек ($1,234.56).
- Пайыздар - бүтін санмен (30%).`,
    state: "СЕЙФ ЖАҒДАЙЫ",
    assets: "АКТИВТЕР",
    recent: "СОҢҒЫ 30 КҮНДЕГІ САЛЫМДАР",
    recentEmpty: "  (соңғы айда салым жоқ)",
  },
};

export function buildSystemPrompt(state: VaultState, lang: Lang = "ru"): string {
  const desc = TOKEN_DESCRIPTIONS[lang];
  const h = HEADERS[lang];

  const allocLines = state.allocation
    .map((a) => {
      const t = findToken(a.mint);
      const sym = t?.symbol ?? a.mint.slice(0, 6);
      const pct = (a.bps / 100).toFixed(0);
      const valueUsd = (state.totalValueUsd * (a.bps / 10_000)).toFixed(2);
      const d = desc[sym] ?? "";
      return `  - ${sym} (${pct}%, ~$${valueUsd}): ${d}`;
    })
    .join("\n");

  const monthAgo = Date.now() / 1000 - 30 * 24 * 3600;
  const recentMonth = state.recentContributions.filter((c) => c.timestamp >= monthAgo);
  const monthTotal = recentMonth.reduce((s, c) => s + c.amount, 0);

  const stateBlock = JSON.stringify(
    {
      vaultName: state.name,
      totalValueUsd: state.totalValueUsd,
      memberCount: state.memberCount,
      receivedThisMonthUsd: monthTotal,
      lastContributionsCount: state.recentContributions.length,
    },
    null,
    2,
  );

  return `${h.intro(state.name)}

${h.lang}

${h.source}

${h.format}

${h.state}
${stateBlock}

${h.assets}
${allocLines}

${h.recent}
${
  recentMonth.length > 0
    ? recentMonth
        .map(
          (c) =>
            `  - $${c.amount.toFixed(2)} ${c.contributor.slice(0, 6)}…${c.memo ? ` (${c.memo})` : ""}`,
        )
        .join("\n")
    : h.recentEmpty
}

/no_think`;
}
