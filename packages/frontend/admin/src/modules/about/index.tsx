import { ScrollArea } from '@affine/admin/components/ui/scroll-area';

import { Header } from '../header';
import { AboutAFFiNE } from './about';

export function ConfigPage() {
  return (
    <div className="h-dvh flex-1 space-y-1 flex-col flex">
      <Header title="服务器" />
      <ScrollArea>
        <AboutAFFiNE />
      </ScrollArea>
    </div>
  );
}

export { ConfigPage as Component };
