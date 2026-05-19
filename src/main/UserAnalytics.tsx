import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, BarChart, Users } from 'lucide-react';
import { TableSkeleton } from '../components/SkeletonLoader';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { showToast } from '../components/Toast';

interface UserAnalyticsRow {
  userId: string;
  fullName: string;
  dailyAcquired: number;
  monthlyAcquired: number;
  quarterlyAcquired: number;
  totalAcquired: number;
}

export default function UserAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<UserAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch profiles
        const profilesSnap = await getDocs(collection(db, 'profiles'));
        const profilesMap: Record<string, string> = {};
        profilesSnap.forEach(doc => {
          const data = doc.data();
          profilesMap[doc.id] = data.full_name || 'Unknown User';
        });

        // 2. Fetch approved requests
        const requestsQuery = query(
          collection(db, 'requests'),
          where('status', '==', 'approved')
        );
        const requestsSnap = await getDocs(requestsQuery);

        // 3. Compute current time periods
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const currentQuarter = Math.floor(currentMonth / 3);

        const userTotals: Record<string, UserAnalyticsRow> = {};

        // Initialize user totals for all known profiles
        Object.keys(profilesMap).forEach(uid => {
          userTotals[uid] = {
            userId: uid,
            fullName: profilesMap[uid],
            dailyAcquired: 0,
            monthlyAcquired: 0,
            quarterlyAcquired: 0,
            totalAcquired: 0
          };
        });

        requestsSnap.forEach(docSnap => {
          const req = docSnap.data();
          const uid = req.user_id;
          
          if (!uid || !userTotals[uid]) return; // Skip if no user_id or unknown user
          
          const acquiredQty = typeof req.approved_quantity === 'number' ? req.approved_quantity : req.quantity;
          const reqDate = new Date(req.created_at);
          const reqDateStr = reqDate.toISOString().split('T')[0];
          
          // Check time periods
          const isDaily = reqDateStr === todayStr;
          const isMonthly = reqDate.getMonth() === currentMonth && reqDate.getFullYear() === currentYear;
          const isQuarterly = Math.floor(reqDate.getMonth() / 3) === currentQuarter && reqDate.getFullYear() === currentYear;

          if (isDaily) userTotals[uid].dailyAcquired += acquiredQty;
          if (isMonthly) userTotals[uid].monthlyAcquired += acquiredQty;
          if (isQuarterly) userTotals[uid].quarterlyAcquired += acquiredQty;
          
          userTotals[uid].totalAcquired += acquiredQty;
        });

        // Convert to array and filter out users with 0 total acquired if we want a cleaner list
        // Or keep everyone so we see 0s. Let's keep everyone but sort by totalAcquired descending.
        const sortedData = Object.values(userTotals).sort((a, b) => b.totalAcquired - a.totalAcquired);
        
        setAnalyticsData(sortedData);
      } catch (error) {
        console.error('Failed to fetch analytics data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const exportPDF = () => {
    try {
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(20);
      docPdf.setTextColor(22, 101, 52); // #166534
      docPdf.text("Supply Inventory Management System", pageWidth / 2, 22, { align: "center" });
      
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(14);
      docPdf.setTextColor(55, 65, 81); // gray-700
      docPdf.text("User Consumption Report", pageWidth / 2, 32, { align: "center" });

      docPdf.setFontSize(10);
      docPdf.setTextColor(107, 114, 128); // gray-500
      docPdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 40, { align: "center" });

      // Table Data
      const tableColumn = ["User Name", "Daily Acquired", "Monthly Acquired", "Quarterly Acquired", "Total All-Time"];
      const tableRows = analyticsData.map(row => [
        row.fullName,
        row.dailyAcquired.toString(),
        row.monthlyAcquired.toString(),
        row.quarterlyAcquired.toString(),
        row.totalAcquired.toString()
      ]);

      autoTable(docPdf, {
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [22, 101, 52], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center', fontStyle: 'bold' },
        }
      });

      docPdf.save(`User_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('PDF Exported Successfully', 'success');
    } catch (error) {
      console.error('PDF generation failed:', error);
      showToast('Failed to generate PDF', 'error');
    }
  };

  return (
    <div className="flex flex-col space-y-4 w-full max-w-full pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 font-[var(--heading)] tracking-tight">User Acquisition</h2>
          <p className="text-sm text-gray-600 mt-1 font-medium">
            Monitor quarterly, monthly, and daily item acquisition per user.
          </p>
        </div>
        
        <button
          onClick={exportPDF}
          disabled={loading || analyticsData.length === 0}
          className="flex items-center gap-2 bg-[#166534] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#14532d] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
        >
          <FileDown className="w-4 h-4" />
          Export to PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Users</p>
            <p className="text-2xl font-black text-gray-800">{analyticsData.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
            <BarChart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Items Acquired This Month</p>
            <p className="text-2xl font-black text-gray-800">
              {analyticsData.reduce((acc, row) => acc + row.monthlyAcquired, 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center">
            <BarChart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Items Acquired This Quarter</p>
            <p className="text-2xl font-black text-gray-800">
              {analyticsData.reduce((acc, row) => acc + row.quarterlyAcquired, 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : analyticsData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <BarChart className="w-8 h-8 text-gray-300" />
              </div>
              <p className="font-medium text-gray-500 text-base">No analytics data found.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-gray-200">
                  <th className="px-6 py-3 text-[11px] font-bold text-[#166534] uppercase tracking-wider">User Name</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-[#166534] uppercase tracking-wider text-center">Daily (Today)</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-[#166534] uppercase tracking-wider text-center">Monthly</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-[#166534] uppercase tracking-wider text-center">Quarterly</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-[#166534] uppercase tracking-wider text-center">Total All-Time</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-50">
                {analyticsData.map((row, index) => (
                  <tr
                    key={row.userId}
                    className={`transition-all duration-200 hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    <td className="px-6 py-3 text-slate-800 font-bold whitespace-nowrap">
                      {row.fullName}
                    </td>
                    <td className="px-6 py-3 text-slate-600 font-medium text-center">
                      <span className={row.dailyAcquired > 0 ? "text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded" : ""}>
                        {row.dailyAcquired}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600 font-medium text-center">
                      {row.monthlyAcquired}
                    </td>
                    <td className="px-6 py-3 text-slate-600 font-medium text-center">
                      {row.quarterlyAcquired}
                    </td>
                    <td className="px-6 py-3 text-slate-900 font-black text-center">
                      {row.totalAcquired}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
