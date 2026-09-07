import { useLanguage } from '@/components/language-provider';
import { cn } from '@/lib/utils';

/** Sliding EN/UR switch, styled to sit next to the theme toggle in the header. */
export function LanguageToggle() {
  const { language, toggle } = useLanguage();
  const isUrdu = language === 'ur';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isUrdu}
      aria-label="Toggle language between English and Urdu"
      onClick={toggle}
      className="relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border bg-muted p-0.5 transition-colors"
    >
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full bg-background text-[9px] font-semibold shadow transition-transform',
          isUrdu && 'translate-x-8',
        )}
      >
        {isUrdu ? 'اردو' : 'EN'}
      </span>
    </button>
  );
}
