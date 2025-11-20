import { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  className?: string;
}

export const Table = ({ children, className = '' }: TableProps) => (
  <div className="overflow-x-auto rounded-lg border border-gray-700">
    <table className={`w-full ${className}`}>{children}</table>
  </div>
);

interface TableHeaderProps {
  children: ReactNode;
}

export const TableHeader = ({ children }: TableHeaderProps) => (
  <thead className="bg-gray-800/50 border-b border-gray-700">{children}</thead>
);

interface TableBodyProps {
  children: ReactNode;
}

export const TableBody = ({ children }: TableBodyProps) => (
  <tbody className="divide-y divide-gray-700/50">{children}</tbody>
);

interface TableRowProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const TableRow = ({ children, className = '', onClick }: TableRowProps) => (
  <tr
    className={`hover:bg-gray-800/30 transition-colors ${
      onClick ? 'cursor-pointer' : ''
    } ${className}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

interface TableHeadProps {
  children: ReactNode;
  className?: string;
}

export const TableHead = ({ children, className = '' }: TableHeadProps) => (
  <th
    className={`px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider ${className}`}
  >
    {children}
  </th>
);

interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export const TableCell = ({ children, className = '' }: TableCellProps) => (
  <td className={`px-4 py-3 text-sm text-gray-300 ${className}`}>{children}</td>
);
