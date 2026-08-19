import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Product } from "../../../shared/types";

type ProductPickerProps = {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
  getMeta?: (product: Product) => string;
};

const productLabel = (product: Product) => product.localName || product.officialName;

const productSearchText = (product: Product) => [
  product.localName,
  product.officialName,
  product.category,
  product.article,
  ...product.identifiers.map((identifier) => identifier.value)
].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU");

export function ProductPicker({ products, value, onChange, disabled = false, getMeta }: ProductPickerProps) {
  const listboxId = useId();
  const selected = products.find((product) => product.id === value);
  const [query, setQuery] = useState(selected ? productLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("ru-RU"));

  useEffect(() => {
    setQuery(selected ? productLabel(selected) : "");
  }, [selected?.id]);

  const matches = useMemo(() => {
    const filtered = deferredQuery
      ? products.filter((product) => productSearchText(product).includes(deferredQuery))
      : products;
    return filtered.slice(0, 30);
  }, [deferredQuery, products]);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  const choose = (product: Product) => {
    onChange(product.id);
    setQuery(productLabel(product));
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, matches.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      choose(matches[activeIndex]);
    }
  };

  return (
    <div
      className="product-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && matches[activeIndex] ? `${listboxId}-${matches[activeIndex].id}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder="Название, артикул или штрихкод"
        value={query}
        onFocus={(event) => {
          event.currentTarget.select();
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="product-picker-results" id={listboxId} role="listbox">
          {matches.length ? matches.map((product, index) => (
            <button
              id={`${listboxId}-${product.id}`}
              type="button"
              role="option"
              aria-selected={product.id === value}
              className={index === activeIndex ? "active" : ""}
              key={product.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(product)}
            >
              <span>
                <strong>{productLabel(product)}</strong>
                <small>{[product.category, product.article].filter(Boolean).join(" · ") || product.officialName}</small>
              </span>
              {getMeta && <span className="product-picker-meta">{getMeta(product)}</span>}
            </button>
          )) : <div className="product-picker-empty">Ничего не найдено</div>}
          {products.length > matches.length && !deferredQuery && (
            <div className="product-picker-empty">Введите название, артикул или штрихкод</div>
          )}
        </div>
      )}
    </div>
  );
}
