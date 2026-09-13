import { useStore } from "@nanostores/react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    dataSourcePromptDismissed,
    showTutorial,
    useLegacyDataSources,
} from "@/lib/context";

export const DataSourceDialog = () => {
    const dismissed = useStore(dataSourcePromptDismissed);
    const tutorial = useStore(showTutorial);
    const chooseSource = (legacy: boolean) => {
        useLegacyDataSources.set(legacy);
        dataSourcePromptDismissed.set(true);
    };

    return (
        <AlertDialog open={!dismissed && !tutorial}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Try the new data source?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        The new API provides POI and high-speed rail data.
                        Results can differ from Overpass, so keep Overpass if
                        you are in the middle of a game. You can change this
                        later in Options.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => chooseSource(true)}>
                        Keep Overpass
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => chooseSource(false)}>
                        Use the API
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
