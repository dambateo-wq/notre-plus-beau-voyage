import ExcelJS from "exceljs";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getLodgingAssignments, getLodgingReservations } from "@/lib/lodging";
import { LODGING_ROOMS } from "@/lib/lodging-rooms";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) return new Response("Non autorisé", { status: 401 });
  const [reservations, assignments] = await Promise.all([getLodgingReservations(), getLodgingAssignments()]);
  const reservationById = new Map(reservations.map((item) => [item.id, item]));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hébergements");
  sheet.views = [{ showGridLines: false }];
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = "HÉBERGEMENTS DU 28/05 AU 30/05";
  sheet.getCell("A1").font = { bold: true, size: 18 };
  sheet.getCell("A1").alignment = { horizontal: "center" };
  sheet.mergeCells("A2:B3"); sheet.getCell("A2").value = "NOM / GROUPE";
  sheet.mergeCells("C2:E2"); sheet.getCell("C2").value = "VENDREDI";
  sheet.mergeCells("F2:H2"); sheet.getCell("F2").value = "SAMEDI";
  sheet.getRow(4).values = ["CHAMBRE", "NOM / GROUPE", "Adultes", "Enfants", "Bébés", "Adultes", "Enfants", "Bébés"];
  for (const cell of ["A2", "C2", "F2", "A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4"]) {
    sheet.getCell(cell).font = { bold: true };
    sheet.getCell(cell).alignment = { horizontal: "center" };
    sheet.getCell(cell).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E8E1D3" } };
  }
  const roomRows = [{ name: "PALMIER", capacity: 2 }, ...LODGING_ROOMS];
  for (const room of roomRows) {
    const allocations = assignments.filter((assignment) => assignment.room_name === room.name);
    const allocatedReservations = allocations.map((allocation) => reservationById.get(allocation.reservation_id)).filter(Boolean);
    const count = (key: "friday_adults" | "friday_children" | "friday_babies" | "saturday_adults" | "saturday_children" | "saturday_babies") => allocations.reduce((total, allocation) => total + allocation[key], 0);
    const owners = room.name === "PALMIER";
    sheet.addRow([
      room.name + " (" + room.capacity + " pers.)",
      owners ? "Damien & Julie" : allocatedReservations.map((reservation) => reservation!.guest_names.join(", ")).join(" / "),
      owners ? 2 : count("friday_adults"), owners ? 0 : count("friday_children"), owners ? 0 : count("friday_babies"),
      owners ? 2 : count("saturday_adults"), owners ? 0 : count("saturday_children"), owners ? 0 : count("saturday_babies"),
    ]);
  }
  const totalRow = sheet.addRow(["TOTAL", "", "=SUM(C5:C" + sheet.rowCount + ")", "=SUM(D5:D" + sheet.rowCount + ")", "=SUM(E5:E" + sheet.rowCount + ")", "=SUM(F5:F" + sheet.rowCount + ")", "=SUM(G5:G" + sheet.rowCount + ")", "=SUM(H5:H" + sheet.rowCount + ")"]);
  totalRow.font = { bold: true };
  sheet.columns = [{ width: 27 }, { width: 52 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
  sheet.eachRow((row) => row.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: "B7B0A2" } }, bottom: { style: "thin", color: { argb: "B7B0A2" } }, left: { style: "thin", color: { argb: "B7B0A2" } }, right: { style: "thin", color: { argb: "B7B0A2" } } }; cell.alignment = { vertical: "middle", wrapText: true }; }));
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=plan-hebergement-mariage.xlsx" } });
}
