/**
 * Левая узкая панель инструментов, как в оригинале (там она сворачивается
 * в вертикальную вкладку «Инструменты»). Декоративная — заказчик просил
 * только внешний вид, отдельная функциональность (Обзор рынка и т.д.) не
 * заказывалась.
 */
export default function LeftRail() {
  return (
    <div className="flex w-6 shrink-0 flex-col items-center border-r border-hairline bg-[#f5f5f7] py-2">
      <span
        className="mb-2 mt-auto text-[11px] text-[#8e8e93]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        Инструменты
      </span>
    </div>
  );
}
