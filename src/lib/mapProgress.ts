import { toast } from "react-toastify";

let active = 0;

export const withMapProgress = async <T>(
    work: () => Promise<T>,
): Promise<T> => {
    const notice = toast.loading("Calculating the map...");
    active++;
    try {
        return await work();
    } finally {
        active--;
        toast.dismiss(notice);
    }
};

export const showMapProgress = <T>(work: Promise<T>, message: string) =>
    active ? work : toast.promise(work, { pending: message });
