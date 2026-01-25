import jsPDF from 'jspdf';

export const exportTripToPDF = async (trip, expenses) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Helper to check page break
  const checkPageBreak = (heightNeeded) => {
    if (yPos + heightNeeded > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Title
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text(trip.name, margin, yPos);
  yPos += 10;

  // Trip Info
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  const dates = `${trip.start_date || 'TBD'} - ${trip.end_date || 'TBD'}`;
  doc.text(dates, margin, yPos);
  yPos += 15;

  // Summary Stats
  const totalSpent = expenses.reduce((acc, curr) => acc + (curr.cost || 0), 0);
  const remaining = (trip.received_amount || 0) - totalSpent;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'FD');
  
  yPos += 7;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('BUDGET', margin + 5, yPos);
  doc.text('SPENT', margin + 65, yPos);
  doc.text('REMAINING', margin + 125, yPos);
  
  yPos += 8;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(`EGP ${trip.received_amount?.toLocaleString()}`, margin + 5, yPos);
  doc.text(`EGP ${totalSpent.toLocaleString()}`, margin + 65, yPos);
  doc.setTextColor(remaining < 0 ? 220 : 0, remaining < 0 ? 20 : 150, remaining < 0 ? 60 : 100);
  doc.text(`EGP ${remaining.toLocaleString()}`, margin + 125, yPos);
  
  yPos += 25;

  // Expenses Table Header
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('DATE', margin, yPos);
  doc.text('CATEGORY', margin + 30, yPos);
  doc.text('NOTES', margin + 70, yPos);
  doc.text('AMOUNT', pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Expenses List
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Sort expenses for export
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  for (const expense of sortedExpenses) {
    checkPageBreak(15);

    const dateStr = new Date(expense.date).toLocaleDateString();
    doc.text(dateStr, margin, yPos);
    doc.text(expense.category || 'Other', margin + 30, yPos);
    
    // Truncate notes if too long
    let notes = expense.notes || '-';
    if (notes.length > 30) notes = notes.substring(0, 27) + '...';
    doc.text(notes, margin + 70, yPos);
    
    doc.text(`EGP ${expense.cost?.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;
  }

  // Receipts Section
  yPos += 20;
  checkPageBreak(40);
  
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Receipts', margin, yPos);
  yPos += 15;

  const expensesWithReceipts = sortedExpenses.filter(e => e.receipt_urls?.length > 0 || e.receipt_url);
  
  if (expensesWithReceipts.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text('No receipts attached.', margin, yPos);
  } else {
    for (const expense of expensesWithReceipts) {
      const urls = expense.receipt_urls?.length > 0 ? expense.receipt_urls : [expense.receipt_url];
      
      for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          checkPageBreak(80); // Check if enough space

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          const title = `${expense.category} - EGP ${expense.cost} (${new Date(expense.date).toLocaleDateString()})${urls.length > 1 ? ` (${i+1}/${urls.length})` : ''}`;
          doc.text(title, margin, yPos);
          yPos += 7;
          
          try {
            const imgData = await getImageData(url);
            const props = doc.getImageProperties(imgData);
            const maxWidth = pageWidth - (margin * 2);
            const maxHeight = 120; // Slightly larger for better visibility
            
            let w = props.width;
            let h = props.height;
            
            if (w > maxWidth) {
              h = (h * maxWidth) / w;
              w = maxWidth;
            }
            if (h > maxHeight) {
              w = (w * maxHeight) / h;
              h = maxHeight;
            }

            doc.addImage(imgData, 'JPEG', margin, yPos, w, h);
            yPos += h + 15;
          } catch (e) {
            doc.setFontSize(9);
            doc.setTextColor(200, 50, 50);
            doc.text('[Error loading image]', margin, yPos);
            yPos += 15;
          }
      }
    }
  }

  doc.save(`${trip.name.replace(/\s+/g, '_')}_Report.pdf`);
};

// Helper to convert URL to base64 for jsPDF
function getImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = url;
  });
}