import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import {
  addPantryItem, addPantryItemsWithDate, adjustRecipe, deletePantryItem, fetchLatestSession,
  fetchPantry, fetchNutritionHistory, generateRecipe, saveSession, addNutritionHistory,
} from "../lib/api";
import type { FlexSession, NutritionHistoryEntry, PantryItem, Profile, Recipe } from "../lib/supabase";
import { RecipeCard } from "../components/RecipeCard";
import { ReceiptOCR } from "../components/ReceiptOCR";
import { ChipSelector } from "../components/ChipSelector";
import {
  AlertCircle, Clock, CookingPot, Flame, Loader2, Plus, Refrigerator, Sparkles, Trash2,
  Utensils, Zap, History, Leaf,
} from "lucide-react";
import type { PantryFlag } from "../lib/supabase";

type StockLevel = "empty" | "average" | "full";
type CookCapacity = "quick" | "standard" | "proper";

interface FlexState {
  stock_level: StockLevel;
  cook_capacity: CookCapacity;
  meal_type: string;
  comfort_score: number;
}

const DEFAULT_FLEX: FlexState = {
  stock_level: "average",
  cook_capacity: "standard",
  meal_type: "dinner",
  comfort_score: 50,
};

interface Props {
  profile: Profile;
}

export function GeneratePage({ profile }: Props) {
  const { t, lang } = useI18n();
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [pantryDraft, setPantryDraft] = useState("");
  const [flex, setFlex] = useState<FlexState>(DEFAULT_FLEX);
  const [lastSession, setLastSession] = useState<FlexSession | null>(null);
  const [recentHistory, setRecentHistory] = useState<NutritionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantryFlags, setPantryFlags] = useState<PantryFlag[]>([]);
  const [adjusting, setAdjusting] = useState<{ index: number; label: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [items, last, history] = await Promise.all([
          fetchPantry(),
          fetchLatestSession(),
          fetchNutritionHistory(30),
        ]);
        if (!mounted) return;
        setPantry(items);
        setLastSession(last);
        setRecentHistory(history);
        if (last) {
          setFlex({
            stock_level: last.stock_level as StockLevel,
            cook_capacity: last.cook_capacity as CookCapacity,
            meal_type: last.meal_type as string,
            comfort_score: last.comfort_score,
          });
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load your session.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const useSoonNames = useMemo(() => new Set(pantryFlags.filter((p) => p.use_soon).map((p) => p.name)), [pantryFlags]);

  const addPantry = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = pantryDraft.trim();
    if (!v) return;
    try {
      const item = await addPantryItem(v);
      setPantry((prev) => [item, ...prev]);
      setPantryDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add pantry item.");
    }
  };

  const removePantry = async (id: string) => {
    try {
      await deletePantryItem(id);
      setPantry((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove pantry item.");
    }
  };

  const onReceiptConfirm = async (names: string[], loggedAt: string) => {
    const added = await addPantryItemsWithDate(names, loggedAt);
    setPantry((prev) => [...added, ...prev]);
  };

  const sameAsYesterday = () => {
    if (!lastSession || generating) return;
    const restored: FlexState = {
      stock_level: lastSession.stock_level as StockLevel,
      cook_capacity: lastSession.cook_capacity as CookCapacity,
      meal_type: lastSession.meal_type as string,
      comfort_score: lastSession.comfort_score,
    };
    setFlex(restored);
    void generate(restored);
  };

  const generate = async (override?: FlexState) => {
    const active = override ?? flex;
    setGenerating(true);
    setError(null);
    setRecipes([]);
    setPantryFlags([]);
    try {
      const res = await generateRecipe({
        profile,
        pantry,
        flex: { ...active, comfort_score: active.comfort_score },
        tier: "standard",
        language: lang,
        recentRecipes: recentHistory.map((h) => ({
          title: h.recipe_title,
          tags: h.recipe_data?.tags ?? [],
          generated_at: h.generated_at,
        })),
      });
      setRecipes(res.recipes);
      setPantryFlags(res.pantry_flags);
      await Promise.all(res.recipes.map((r) => addNutritionHistory(r, active.meal_type)));
      await saveSession({
        stock_level: active.stock_level,
        cook_capacity: active.cook_capacity,
        meal_type: active.meal_type,
        comfort_score: active.comfort_score,
        pantry_snapshot: pantry.map((p) => p.name),
      });
      const [last, history] = await Promise.all([fetchLatestSession(), fetchNutritionHistory(30)]);
      setLastSession(last);
      setRecentHistory(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recipe generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const adjust = async (index: number, label: string, instruction: string) => {
    const recipe = recipes[index];
    if (!recipe) return;
    setAdjusting({ index, label });
    setError(null);
    try {
      const res = await adjustRecipe({
        profile,
        pantry,
        flex,
        tier: "standard",
        language: lang,
        adjustment: instruction,
        previousRecipe: recipe,
      });
      setRecipes((prev) => prev.map((r, i) => i === index ? res.recipes[0] : r));
      setPantryFlags(res.pantry_flags);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setAdjusting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="px-5 sm:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl text-charcoal-900">{t("flexEngineTitle")}</h1>
        <p className="muted mt-2 text-balance">{t("flexEngineSub")}</p>
      </div>

      {lastSession && (
        <button
          type="button"
          onClick={sameAsYesterday}
          disabled={generating}
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-sage-100 text-sage-800 px-4 py-2 text-sm font-medium hover:bg-sage-200 transition active:scale-[0.98] disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          {generating ? t("generating") : t("sameAsYesterday")}
        </button>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Pantry */}
        <section className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Refrigerator className="h-5 w-5 text-sage-700" />
            <h2 className="font-serif text-xl">{t("pantryTitle")}</h2>
          </div>
          <p className="muted text-sm mb-4">{t("pantrySubtitle")}</p>

          <form onSubmit={addPantry} className="flex gap-2 mb-4">
            <input
              value={pantryDraft}
              onChange={(e) => setPantryDraft(e.target.value)}
              placeholder={t("pantryPlaceholder")}
              className="input"
            />
            <button type="submit" disabled={!pantryDraft.trim()} className="btn-primary shrink-0">
              <Plus className="h-4 w-4" /> {t("add")}
            </button>
          </form>

          {/* Receipt OCR */}
          <div className="mb-4">
            <ReceiptOCR onConfirm={onReceiptConfirm} />
          </div>

          {pantry.length === 0 ? (
            <p className="muted text-sm italic">{t("pantryEmpty")}</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto no-scrollbar pr-1">
              {pantry.map((item) => {
                const flag = pantryFlags.find((p) => p.name === item.name);
                const useSoon = flag?.use_soon;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-cream-100/70 border border-cream-200/70 px-3.5 py-2.5 animate-fade-in"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-charcoal-900 capitalize truncate">{item.name}</div>
                      <div className="text-xs muted">
                        {t("added")} {timeAgo(item.logged_at)}
                        {flag?.shelf_life_days != null && (
                          <span className="ml-2">· {t("shelfLife")} {flag.shelf_life_days}d</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {useSoon && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-clay-700 bg-clay-50 border border-clay-200 rounded-full px-2.5 py-1">
                          <Flame className="h-3 w-3" /> {t("useSoon")}
                          {flag?.days_left != null && flag.days_left >= 0 && ` · ${flag.days_left}d`}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePantry(item.id)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full text-charcoal-700/50 hover:text-clay-700 hover:bg-clay-50 transition"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Context controls */}
        <section className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CookingPot className="h-5 w-5 text-sage-700" />
            <h2 className="font-serif text-xl">{t("contextTitle")}</h2>
          </div>
          <div className="space-y-5">
            <Field label={t("stockLevel")}>
              <Segmented
                options={[
                  { value: "empty", label: t("empty"), icon: <Refrigerator className="h-4 w-4" /> },
                  { value: "average", label: t("average"), icon: <Leaf className="h-4 w-4" /> },
                  { value: "full", label: t("fullyStocked"), icon: <Utensils className="h-4 w-4" /> },
                ]}
                value={flex.stock_level}
                onChange={(v) => setFlex({ ...flex, stock_level: v as StockLevel })}
              />
            </Field>
            <Field label={t("cookCapacity")}>
              <Segmented
                options={[
                  { value: "quick", label: t("quickEasy"), icon: <Zap className="h-4 w-4" /> },
                  { value: "standard", label: t("standard"), icon: <Clock className="h-4 w-4" /> },
                  { value: "proper", label: t("cookProperly"), icon: <CookingPot className="h-4 w-4" /> },
                ]}
                value={flex.cook_capacity}
                onChange={(v) => setFlex({ ...flex, cook_capacity: v as CookCapacity })}
              />
            </Field>
            <Field label={t("mealType")}>
              <ChipSelector
                category="meal_type"
                selected={[flex.meal_type]}
                onChange={(next) => {
                  if (next.length > 0) setFlex({ ...flex, meal_type: next[next.length - 1] });
                }}
                color="sage"
                placeholder={t("addYourOwn")}
              />
            </Field>
            <Field label={`${t("comfortAdventurous")} · ${flex.comfort_score}`}>
              <div className="pt-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={flex.comfort_score}
                  onChange={(e) => setFlex({ ...flex, comfort_score: Number(e.target.value) })}
                  className="w-full accent-sage-600"
                />
                <div className="flex justify-between text-xs muted mt-1">
                  <span>{t("comfortFood")}</span>
                  <span>{t("balanced")}</span>
                  <span>{t("adventurous")}</span>
                </div>
              </div>
            </Field>
          </div>
        </section>
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 text-sm text-clay-700 bg-clay-50 border border-clay-200 rounded-xl px-3.5 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <button type="button" onClick={() => generate()} disabled={generating} className="btn-clay text-base px-7 py-3.5">
          {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          {generating ? t("generating") : t("generate")}
        </button>
      </div>

      {recipes.length > 0 && (
        <div className="mt-8 space-y-6">
          {recipes.map((recipe, i) => (
            <RecipeCard
              key={i}
              recipe={recipe}
              pantryFlags={pantryFlags}
              useSoonNames={useSoonNames}
              adjusting={adjusting?.index === i ? adjusting.label : null}
              onAdjust={(label, instruction) => adjust(i, label, instruction)}
              profile={profile}
              index={i}
              pantry={pantry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label">{label}</div>{children}</div>;
}

function Segmented({ options, value, onChange }: { options: { value: string; label: string; icon?: React.ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)} className={`chip ${on ? "chip-on" : "chip-off"}`}>
            {opt.icon}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
