import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { RestrictedEntity } from '../types/portshield';

interface WatchlistSectionProps {
  entities: RestrictedEntity[];
}

export const WatchlistSection: React.FC<WatchlistSectionProps> = ({ entities }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) =>
        e.officialName.toLowerCase().includes(q) ||
        (e.sector || '').toLowerCase().includes(q) ||
        (e.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  }, [entities, query]);

  return (
    <section id="watchlist" className="py-16 border-b border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-xs font-medium tracking-wider uppercase text-[#64748B] mb-2">
              05. DHS UFLPA Restricted Watchlist Reference
            </p>
            <h2 className="text-2xl font-semibold text-[#F1F5F9] tracking-tight text-balance">
              Active Entity List &amp; Multilingual Alias Index
            </h2>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter entity, Mandarin alias, or sector..."
              className="w-full rounded-lg bg-[#11161D] border border-[#1E293B] pl-9 pr-3.5 py-2 text-xs text-[#E5ECF4] placeholder:text-[#64748B] focus:outline-none focus:border-[#3B82F6]"
            />
          </div>
        </div>

        <div className="bg-[#11161D] border border-[#1E293B] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-[11px] uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Official Listed Entity</th>
                  <th className="py-3 px-4">Native &amp; Pinyin Aliases</th>
                  <th className="py-3 px-4">Sector</th>
                  <th className="py-3 px-4">Listed</th>
                  <th className="py-3 px-4 text-right">Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#64748B]">
                      No restricted entities matched your filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((entity) => (
                    <tr key={entity.entityId} className="hover:bg-[#161C24] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-[#F1F5F9]">
                        {entity.officialName}
                      </td>
                      <td className="py-3.5 px-4 text-[#94A3B8]">
                        {(entity.aliases || []).join(' · ')}
                      </td>
                      <td className="py-3.5 px-4 text-[#CBD5E1]">{entity.sector || 'General'}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#94A3B8]">
                        {entity.listingDate}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-[#EF4444]">
                        {entity.riskLevel}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
