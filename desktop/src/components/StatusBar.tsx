/** Нижняя статус-строка окна, как в оригинале. Декоративная. */
export default function StatusBar() {
  return (
    <div className="flex h-5 shrink-0 items-center gap-4 border-t border-hairline bg-[#f5f5f7] px-3 text-[11px] text-[#8e8e93]">
      <span>Для вызова справки нажмите F1</span>
      <span className="ml-auto flex items-center gap-3">
        <span>Маркет</span>
        <span>Сигналы</span>
        <span>VPS</span>
        <span>Тестер</span>
        <span className="tnum">0.0 / 0.0 Mb</span>
        <span>Default</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" title="Соединение установлено" />
      </span>
    </div>
  );
}
