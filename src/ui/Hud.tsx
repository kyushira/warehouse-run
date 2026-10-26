import { ClipboardList, PackageOpen, ShoppingBag, Truck } from 'lucide-react';
import { S, canShip, waitingKits } from '../game/sim';
import type { MobileTab } from '../game/store';
import { useSim, useUi } from '../game/store';
import { FloorTab, ShopTab, SidePanel } from './DepotPanel';
import { ShipTabs, ShipmentTracker, TrackingBody } from './ShipmentTracker';
import { ZoomControls } from './Chrome';
import { YardList } from './YardList';

/** Desktop: one sidebar (floor / yard / shop) + one shipment-tracking panel. */
export function DesktopHud() {
  return (
    <>
      <ZoomControls />
      <SidePanel />
      <div className="bottom">
        <ShipmentTracker />
      </div>
    </>
  );
}

export function MobileHud() {
  useSim();
  const tab = useUi((s) => s.mobileTab);
  const open = useUi((s) => s.sheetOpen);
  const setTab = useUi((s) => s.setMobileTab);
  const setSheet = useUi((s) => s.setSheet);
  const ready = S.shipments.filter(canShip).length;
  const kits = waitingKits().length;
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'orders', label: 'Orders', icon: <ClipboardList size={13} /> },
    { id: 'floor', label: 'Floor', icon: <PackageOpen size={13} />, badge: kits || (S.wcs.some((w) => w.down) ? '!' : undefined) },
    { id: 'yard', label: 'Yard', icon: <Truck size={13} />, badge: ready || undefined },
    { id: 'shop', label: 'Shop', icon: <ShoppingBag size={13} /> },
  ];
  return (
    <>
      <ZoomControls />
      <div className="sheet panel" style={{ height: open ? '46vh' : 'calc(92px + var(--safe-b))' }}>
        <div className="grab" onClick={() => setSheet(!open)}><i /></div>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {t.icon}{t.label}
              {t.badge !== undefined && <span className="tbadge">{t.badge}</span>}
            </button>
          ))}
        </div>
        {open && (
          <div className="body">
            {tab === 'orders' && (<><div style={{ marginBottom: 8 }}><ShipTabs /></div><TrackingBody /></>)}
            {tab === 'floor' && <FloorTab />}
            {tab === 'yard' && <YardList />}
            {tab === 'shop' && <ShopTab />}
          </div>
        )}
      </div>
    </>
  );
}
