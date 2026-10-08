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

// In-app replacement for window.confirm(). Pass `confirm = { title, description, confirmLabel, onConfirm }`
// to open it, or null to close it.
export default function ConfirmDialog({ confirm, onClose }) {
  return (
    <AlertDialog open={!!confirm} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="z-[70] max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          {confirm?.description && <AlertDialogDescription>{confirm.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{confirm?.cancelLabel || "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => confirm?.onConfirm()}
          >
            {confirm?.confirmLabel || "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
