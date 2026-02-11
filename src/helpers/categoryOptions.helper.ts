import { IAmountData } from "@/context/context.interface";

const MIN_CATEGORY_LENGTH = 2;
const MAX_CATEGORY_LENGTH = 32;

export const sanitizeCategory = (category?: string | null) => {
  if (!category) {
    return null;
  }

  const normalized = category.replace(/^#+/, "").replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
};

const isValidCategorySuggestion = (category: string) =>
  category.length >= MIN_CATEGORY_LENGTH && category.length <= MAX_CATEGORY_LENGTH;

export const getTransactionCategory = (
  item: Pick<IAmountData, "category" | "tag">,
) => {
  return sanitizeCategory(item.category) ?? sanitizeCategory(item.tag) ?? null;
};

export const getTopCategoriesByUsage = (
  items: IAmountData[],
  maxCategories = 5,
) => {
  const categoriesMap = new Map<
    string,
    { label: string; count: number; lastUsedAt: number }
  >();

  for (const item of items) {
    const sanitized = getTransactionCategory(item);

    if (!sanitized || !isValidCategorySuggestion(sanitized)) {
      continue;
    }

    const key = sanitized.toLowerCase();
    const createdAt = new Date(item.created_date).getTime();
    const current = categoriesMap.get(key);

    if (!current) {
      categoriesMap.set(key, {
        label: sanitized,
        count: 1,
        lastUsedAt: Number.isFinite(createdAt) ? createdAt : 0,
      });
      continue;
    }

    const lastUsedAt = Number.isFinite(createdAt)
      ? Math.max(current.lastUsedAt, createdAt)
      : current.lastUsedAt;

    categoriesMap.set(key, {
      label: lastUsedAt > current.lastUsedAt ? sanitized : current.label,
      count: current.count + 1,
      lastUsedAt,
    });
  }

  return Array.from(categoriesMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return b.lastUsedAt - a.lastUsedAt;
    })
    .slice(0, maxCategories)
    .map((item) => item.label);
};

export const mergeCategories = (
  preferredCategories: string[],
  defaultCategories: string[],
) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const category of [...preferredCategories, ...defaultCategories]) {
    const sanitized = sanitizeCategory(category);

    if (!sanitized || !isValidCategorySuggestion(sanitized)) {
      continue;
    }

    const key = sanitized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(sanitized);
  }

  return result;
};
