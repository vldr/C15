`timescale 1ns / 100ps

module cpu( 
    // Inputs
    HADDR,
    HBURST,
    HCLK,
    HREADYIN,
    HRESETN,
    HSEL,
    HSIZE,
    HTRANS,
    HWDATA,
    HWRITE,

    // Outputs
    HRDATA,
    HREADYOUT,
    HRESP,
    led0,
    led1,
    led2,
    led3,
    led4,
    led5,
    led6,
    led7,

	// UART
    uart_data_in,
    uart_data_out,  
    uart_n_write,
    uart_n_read,
    uart_tx_ready,
    uart_rx_ready
);

//--------------------------------------------------------------------
// Input
//--------------------------------------------------------------------
input  [31:0] HADDR;
input  [2:0]  HBURST;
input         HCLK;
input         HREADYIN;
input         HRESETN;
input         HSEL;
input  [2:0]  HSIZE;
input  [1:0]  HTRANS;
input  [31:0] HWDATA;
input         HWRITE;

input  [7:0]    uart_data_in;
input           uart_tx_ready;
input           uart_rx_ready;

//--------------------------------------------------------------------
// Output
//--------------------------------------------------------------------
output [31:0] HRDATA;
output        HREADYOUT;
output [1:0]  HRESP;
output led0;
output led1;
output led2; 
output led3;
output led4;
output led5;
output led6;
output led7;

output  [7:0]    uart_data_out;
output           uart_n_write;
output           uart_n_read;

assign led0 = ~led[0];
assign led1 = ~led[1];
assign led2 = ~led[2];
assign led3 = ~led[3];
assign led4 = ~led[4];
assign led5 = ~led[5];
assign led6 = ~led[6];
assign led7 = ~led[7];

//--------------------------------------------------------------------
// Registers
//--------------------------------------------------------------------


// LED register.
reg [7:0] led = 8'b00000000;

// Memory of the cpu.
reg [31:0] memory [500:0];

// Register HIGH executing, LOW idle.
reg is_executing = 0;

// Integer used to navigate through the memory.
reg[11:0] position = 0;

// 32 bit A register.   
reg [31:0] register_a = 0;

// 32 bit B register.
reg [31:0] register_b = 0;

// 32 bit result register R.
reg [31:0] register_r = 0;

// 1 bit Z register.
reg register_z = 0;

// 1 bit greater than register.
reg register_greater_than = 0;

// 1 bit less than register.
reg register_less_than = 0;

// 1 bit too long execution
reg register_out_of_time = 0;

// Stack related items.
integer stack_memory_position = 0;
reg [31:0] stack_memory [120:0];

// Stack related items.
integer stack_position = 0;
reg [11:0] call_stack [50:0];

// Counter used for limiting execution time to one second.
reg [26:0] counter = 0;

//--------------------------------------------------------------------
// Ring Oscilator
//--------------------------------------------------------------------

localparam NUM_OF_RINGS = 1;

// RNG registers
reg [6:0] is_rnging = 0;
wire [NUM_OF_RINGS-1:0] oscilator_out;

genvar i;
generate
    for(i = 0; i < NUM_OF_RINGS; i = i+1) begin
        wire n0;
        wire n1;
        wire n2;
        wire n3;
        wire n4;
        wire n5;
        wire n6;

        not x1(n6, n0);
        not x2(n0, n1);
        not x3(n1, n2);
        not x4(n2, n3);
        not x5(n3, n4);
        not x6(n4, n5);
        not x7(n5, oscilator_out);

        assign oscilator_out[i] = is_rnging ? n6 : 0;
    end
endgenerate

//--------------------------------------------------------------------
// Opcodes
//--------------------------------------------------------------------

localparam HALT = 8'h00;
localparam SAVE = 8'h01;
localparam STORE = 8'h02;
localparam GETA = 8'h03;
localparam GETB = 8'h04;
localparam ADD = 8'h05;
localparam SUB = 8'h06;
localparam MULT = 8'h07;
localparam DIV = 8'h08;
localparam REM = 8'h09;
localparam JMP = 8'h0A;
localparam INC = 8'h0B;
localparam DEC = 8'h0C;
localparam JZ = 8'h0D;
localparam CMP = 8'h0E;
localparam CALL = 8'h0F;
localparam RTN = 8'h10;
localparam JNZ = 8'h11;
localparam MOV = 8'h12;
localparam JLT = 8'h13;
localparam JLTE = 8'h14;
localparam JGT = 8'h15;
localparam JGTE = 8'h16;
localparam SWAP = 8'h17;
localparam SAVEA = 8'h18;
localparam SAVEB = 8'h19;
localparam RAND = 8'h1A;
localparam PUSH = 8'h1B;
localparam POP = 8'h1C;
localparam CMPLT = 8'h1D;
localparam CMPGT = 8'h1E;
localparam CMPLTE = 8'h1F;
localparam CMPGTE = 8'h20;
localparam CMPE = 8'h21;
localparam CMPNE = 8'h22;
localparam JA = 8'h23;
localparam JNA = 8'h24;
localparam NEG = 8'h25;
localparam NOP = 8'h26;
localparam SHIFTL = 8'h27;
localparam SHIFTR = 8'h28;
localparam AND = 8'h29;
localparam OR = 8'h2A;
localparam XOR = 8'h2B;
localparam TICK = 8'h2C;
localparam FADD = 8'h2D;
localparam FLTOINT = 8'h2E;
localparam INTTOFL = 8'h2F;
localparam FMULT = 8'h30;
localparam FDIV = 8'h31;
localparam QADD = 8'h32;
localparam MOVOUT = 8'h33;
localparam MOVIN = 8'h34;
localparam VGETA = 8'h35;
localparam VGETB = 8'h36;
localparam QSTORE = 8'h37;
localparam SETLED = 8'h38;
localparam RCALL = 8'h39;
localparam SDIV = 8'h3A;
localparam SREM = 8'h3B;
localparam SMULT = 8'h3C;
localparam SADD = 8'h3D;
localparam SSUB = 8'h3E;
localparam SCMPLT = 8'h3F;
localparam SCMPGT = 8'h40;
localparam SCMPLTE = 8'h41;
localparam SCMPGTE = 8'h42;
localparam SCMPE = 8'h43;
localparam SCMPNE = 8'h44;
localparam FCMPLT = 8'h45;
localparam FCMPGT = 8'h46;
localparam FCMPLTE = 8'h47;
localparam FCMPGTE = 8'h48;
localparam FCMPE = 8'h49;
localparam FCMPNE = 8'h4A;
localparam FSUB = 8'h4B;
localparam SINC = 8'h4C;
localparam FINC = 8'h4D;
localparam SDEC = 8'h4E;
localparam FDEC = 8'h4F;
localparam SNEG = 8'h50;
localparam FNEG = 8'h51;
localparam VPUSH = 8'h52;
localparam SAVETO = 8'h53;
localparam GETPOPA = 8'h54;
localparam GETPOPB = 8'h55;
localparam STOREPUSH = 8'h56;
localparam MOVOUTPUSH = 8'h57;
localparam MOVINPOP = 8'h58;
localparam NOT = 8'h59;
localparam GETPOPR = 8'h5A;
localparam LAND = 8'h5B;
localparam LOR = 8'h5C;
localparam POPNOP = 8'h5D;
localparam QLADD = 8'h5E;
localparam QLSUB = 8'h5F;
localparam QSUB = 8'h60;
localparam GETAVB = 8'h61;

//--------------------------------------------------------------------
// State-machine registers
//--------------------------------------------------------------------

reg [1:0] finished_reading = 0;
reg [2:0] finished_writing = 0;
reg [7:0] finished_output;

reg [1:0] switch;
reg [1:0] selector;

reg [31:0] input_address;
reg [31:0] input_data;

reg [31:0] output_data;
reg push_output_data;

// Data move registers.
reg [11:0] move_addr;
reg [31:0] move_value;
reg is_writing = 0;
reg is_pushing = 0;
reg is_fetching = 0;

// Division registers.
reg [1:0] is_dividing;  
reg [4:0] cycle; 
reg [31:0] denom; 
reg [31:0] work; 
wire [32:0] sub = { work[30:0], register_r[31] } - denom; 
reg division_sign_bit;

assign uart_data_out = finished_output;
assign uart_n_write = !(finished_writing == 1);
assign uart_n_read = !(finished_reading == 1);

//////////////////////////////////////////////////

reg is_f_multing = 0;
reg is_f_multing_read = 0;
reg is_f_multing_finished = 0;
reg [31:0] f_mult_result = 0;

fmult f32_mult(
    .clk(HCLK),
    .rst(HRESETN),
    
    .input_a(register_a),
    .input_b(register_b),
    
    .input_a_stb(is_f_multing),
    .input_b_stb(is_f_multing),
    
    .output_z_stb(is_f_multing_finished),
    .output_z(f_mult_result),
    .output_z_ack(is_f_multing_read)
);

//////////////////////////////////////////////////

reg is_f_diving = 0;
reg is_f_diving_read = 0;
reg is_f_diving_finished = 0;
reg [31:0] f_div_result = 0;

fdiv f32_div(
    .clk(HCLK),
    .rst(HRESETN),
    
    .input_a(register_a),
    .input_b(register_b),
    
    .input_a_stb(is_f_diving),
    .input_b_stb(is_f_diving),
    
    .output_z_stb(is_f_diving_finished),
    .output_z(f_div_result),
    .output_z_ack(is_f_diving_read)
);

//////////////////////////////////////////////////


reg is_f_adding_finished = 0;
reg is_f_adding = 0;
reg is_f_adding_read = 0;
reg [31:0] f_adder_result = 0;

fadder f32_adder(
    .clk(HCLK),
    .rst(HRESETN),
    
    .input_a(register_a),
    .input_b(register_b),
    
    .input_a_stb(is_f_adding),
    .input_b_stb(is_f_adding),
    
    .output_z_stb(is_f_adding_finished),
    .output_z(f_adder_result),
    .output_z_ack(is_f_adding_read)
);

//////////////////////////////////////////////////

reg is_f_to_i = 0;
reg is_f_to_i_read = 0;
reg is_f_to_i_finished = 0;
reg [31:0] f_to_i_result = 0;

float_to_int f_to_i(
    .clk(HCLK),
    .rst(HRESETN),
    
    .input_a(register_a),
    .input_a_stb(is_f_to_i),
    
    .output_z_stb(is_f_to_i_finished),
    .output_z(f_to_i_result),
    .output_z_ack(is_f_to_i_read)
);

//////////////////////////////////////////////////

reg is_i_to_f = 0;
reg is_i_to_f_read = 0;
reg is_i_to_f_finished = 0;
reg [31:0] i_to_f_result = 0;

int_to_float i_to_f(
    .clk(HCLK),
    .rst(HRESETN),
    
    .input_a(register_a),
    .input_a_stb(is_i_to_f),
    
    .output_z_stb(is_i_to_f_finished),
    .output_z(i_to_f_result),
    .output_z_ack(is_i_to_f_read)
);

//////////////////////////////////////////////////

`define OPCODE 7:0
`define ARG0 19:8
`define ARG1 31:20

reg [31:0] current_instruction;
wire [7:0] opcode = current_instruction[`OPCODE];
wire [11:0] arg0 = current_instruction[`ARG0];
wire [11:0] arg1 = current_instruction[`ARG1];

//////////////////////////////////////////////////

always @(posedge HCLK or negedge HRESETN) begin
    // Check if one second has surpassed, stop the execution if so.
    if (counter == 100_000_000)
    begin
        is_executing <= 0;
        register_out_of_time <= 1;
    end
    
    // Perform a reset.
    if (!HRESETN) begin
        stack_memory_position <= 0;
        stack_position <= 0;
        position <= 0;
        register_a <= 0;
        register_b <= 0;
        register_r <= 0;
        register_z <= 0;
        register_out_of_time <= 0;
        register_greater_than <= 0;
        register_less_than <= 0;
        
        current_instruction <= 0;
        
        is_f_adding <= 0;
        is_f_to_i <= 0;
        is_i_to_f <= 0;
        is_f_diving <= 0;
        is_f_multing <= 0;
        
        division_sign_bit <= 0;
        
        is_f_adding_read <= 0;
        is_f_multing_read <= 0;
        is_f_diving_read <= 0;
        is_f_to_i_read <= 0;
        is_i_to_f_read <= 0;

        counter <= 0;
        is_writing <= 0;
        is_pushing <= 0;
        is_dividing <= 0;
        is_rnging <= 0;
        
        cycle <= 0;   
        denom <= 0;  
        work <= 0;
       
        led[7:0] <= 8'h2; 
        input_address <= 32'h0;
        input_data <= 32'h0;
        output_data <= 32'h0;
        switch <= 2'h0;
        selector <= 2'h0;
        finished_reading <= 0;
        finished_writing <= 0;
        finished_output <= 0;
        
        is_executing <= 0;
    end 
    else if (finished_writing == 1)
        finished_writing <= 0;
    else if (uart_tx_ready && finished_reading == 0 && finished_writing == 0 && push_output_data) begin
        finished_output[7:0] <= output_data[(selector * 8) +: 8];
        
        if (selector == 3)
            push_output_data <= 0;
            
        finished_writing <= 1;
        selector <= selector + 1;
    end
    else if (finished_reading == 1)
        finished_reading <= 2;
    else if (finished_reading == 2)
        finished_reading <= 0;
    else if (uart_rx_ready && finished_reading == 0 && finished_writing == 0) begin
        if (switch == 0) begin
            input_address[(selector * 8) +: 8] <= uart_data_in[7:0];
            
            if (selector == 3)
                switch <= 1;
            
            selector <= selector + 1;
        end else if (switch == 1) begin
            input_data[(selector * 8) +: 8] <= uart_data_in[7:0];
            
            if (selector == 3)
                switch <= 2;
            
            selector <= selector + 1;
        end
        
        finished_reading <= 1;
    end 
    else if (switch == 2)
    begin  
        if (input_address == 32'd1000) begin
            stack_memory_position <= 0;
        
            position <= 0; 
            is_executing <= 1;
            register_a <= 0;
            register_b <= 0;
            register_r <= 0;
            register_z <= 0;
            
            register_out_of_time <= 0;
            register_greater_than <= 0;
            register_less_than <= 0;
            
            is_writing <= 0;
            is_pushing <= 0;
            is_dividing <= 0;
            is_rnging <= 0;
            
            is_f_adding <= 0;
            is_f_to_i <= 0;
            is_i_to_f <= 0;
            is_f_diving <= 0;
            is_f_multing <= 0;
            
            current_instruction <= memory[0];
            
            division_sign_bit <= 0;
            
            is_f_adding_read <= 0;
            is_f_multing_read <= 0;
            is_f_diving_read <= 0;
            is_f_to_i_read <= 0;
            is_i_to_f_read <= 0;
            
            cycle <= 0;   
            denom <= 0;  
            work <= 0;  
            
            counter <= 0;
        end
        else if (input_address == 32'd1001) begin
            output_data <= register_a;
            push_output_data <= 1; 
        end
        else if (input_address == 32'd1002) begin
            output_data <= register_b;   
            push_output_data <= 1;
        end
        else if (input_address == 32'd1003) begin
            output_data <= register_r;
            push_output_data <= 1;
        end
        else if (input_address == 32'd1004) begin
            output_data <= register_z;
            push_output_data <= 1;
        end
        else if (input_address == 32'd1005) begin
            output_data <= register_greater_than;
            push_output_data <= 1;
        end
        else if (input_address == 32'd1006) begin
            output_data <= register_less_than;  
            push_output_data <= 1;
        end
        else if (input_address == 32'd1007) begin
            output_data <= register_out_of_time;
            push_output_data <= 1;
        end
        else if (input_address == 32'd1008) begin
            output_data <= is_executing;
            push_output_data <= 1;
        end
        else if (input_address == 32'd1009) begin
            output_data <= memory[input_data];
            push_output_data <= 1;
        end
        else if (input_address == 32'd1010) begin
            led <= input_data;
        end
        else begin
            memory[input_address] <= input_data;
        end
        
        switch <= 0;
    end
    else if (is_executing) begin
        if (is_rnging) begin
            if ((is_rnging % 2) == 0)
                register_r <= { register_r, oscilator_out };

            if (is_rnging == 7'd64)
                is_rnging <= 0;
            else
                is_rnging <= is_rnging + 1; 
        end
        else if (is_dividing) begin
            if (sub[32] == 0) begin  
                work <= sub[31:0];  
                register_r <= {register_r[30:0], 1'b1}; 

                if (cycle == 0) begin
                    if (division_sign_bit) begin
                        if (is_dividing == 2) begin 
                            register_r <= -sub[31:0];
                            register_z <= sub[31:0] == 0;
                        end else begin
                            register_r <= -{register_r[30:0], 1'b1};
                            register_z <= {register_r[30:0], 1'b1} == 0;
                        end
                    end 
                    else begin
                        if (is_dividing == 2) begin 
                            register_r <= sub[31:0];
                            register_z <= sub[31:0] == 0;
                        end else begin
                            register_z <= {register_r[30:0], 1'b1} == 0;
                        end
                    end

                    is_dividing <= 0;
                    division_sign_bit <= 0;
                end 
            end  
            else begin  
                work <= {work[30:0], register_r[31]};  
                register_r <= {register_r[30:0], 1'b0};  

                if (cycle == 0) begin 
                    if (division_sign_bit) begin
                         if (is_dividing == 2) begin
                            register_r <= -{work[30:0], register_r[31]};
                            register_z <= {work[30:0], register_r[31]} == 0;
                        end 
                        else begin
                            register_r <= -{register_r[30:0], 1'b0};
                            register_z <= {register_r[30:0], 1'b0} == 0;
                        end
                    end 
                    else begin
                        if (is_dividing == 2) begin
                            register_r <= {work[30:0], register_r[31]};
                            register_z <= {work[30:0], register_r[31]} == 0;
                        end 
                        else begin
                            register_z <= {register_r[30:0], 1'b0} == 0;
                        end
                    end
                    
                    is_dividing <= 0;
                    division_sign_bit <= 0;
                end 
            end  

            cycle <= cycle - 5'd1;  
        end else if (is_writing) begin
            memory[move_addr] <= move_value;
            is_writing <= 0;
        end else if (is_pushing) begin
            stack_memory[stack_memory_position] <= move_value;
            stack_memory_position <= stack_memory_position + 1;
            
            is_pushing <= 0;
        end
        else if (is_f_adding || is_f_to_i || is_i_to_f || is_f_diving || is_f_multing || is_f_adding_finished || is_f_to_i_finished || is_i_to_f_finished || is_f_diving_finished || is_f_multing_finished) 
        begin
            if (is_f_adding_finished) begin 
                register_r <= f_adder_result;
                is_f_adding <= 0;
                is_f_adding_read <= 1;
            end 
            else if (is_f_to_i_finished) begin
                register_r <= f_to_i_result;
                is_f_to_i <= 0;
                is_f_to_i_read <= 1;
            end
            else if (is_i_to_f_finished) begin
                register_r <= i_to_f_result;
                is_i_to_f <= 0;
                is_i_to_f_read <= 1;
            end
            else if (is_f_diving_finished) begin
                register_r <= f_div_result;
                is_f_diving <= 0;
                is_f_diving_read <= 1;
            end
            else if (is_f_multing_finished) begin
                register_r <= f_mult_result;
                is_f_multing <= 0;
                is_f_multing_read <= 1;
            end
        end
        else begin
            case (opcode)
                HALT : begin
                    is_executing <= 0;
                end 
                SAVE : begin
                    memory[arg0] <= register_r;
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                STORE : begin
                    move_addr <= arg0;
                    move_value <= memory[
                        position + 1
                    ];
                    is_writing <= 1;

                    position <= position + 2;
                    current_instruction <= memory[position + 2];
                end
                QSTORE : begin
                    memory[arg1] <= arg0;

                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                GETA : begin
                    register_a <= memory[
                        arg0
                    ];
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                GETB : begin
                    register_b <= memory[
                        arg0
                    ];
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                VGETA : begin
                    register_a <= arg0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                VGETB : begin
                    register_b <= arg0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SNEG : begin
                    register_r <= -register_a;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FNEG : begin
                    register_r <= { ~register_a[31], register_a[30:0] };
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMPLT, SCMPLT, FCMPLT : begin
                    if (opcode == CMPLT)
                        register_r <= (register_a < register_b);
                    else if (opcode == FCMPLT) 
                    begin
                        if (register_a[31] != register_b[31])
                            register_r <= (register_a[31] && (((register_a | register_b) << 1) != 0));
                        else
                            register_r <= ((register_a != register_b) && (register_a[31] ^ (register_a < register_b)));
                    end
                    else
                        register_r <= ($signed(register_a) < $signed(register_b));

                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                CMPGT, SCMPGT, FCMPGT : begin
                    if (opcode == CMPGT)
                        register_r <= (register_a > register_b);
                    else if (opcode == FCMPGT) begin
                         if (register_a[31] != register_b[31])
                            register_r <= !(register_a[31] || (((register_a | register_b) << 1) == 0));
                        else
                            register_r <= !((register_a == register_b) || (register_a[31] ^ (register_a < register_b)));
                    end
                    else
                        register_r <= ($signed(register_a) > $signed(register_b));
                        
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMPLTE, SCMPLTE, FCMPLTE : begin
                    if (opcode == CMPLTE)
                        register_r <= (register_a <= register_b);
                    else if (opcode == FCMPLTE) begin
                        if (register_a[31] != register_b[31])
                            register_r <= (register_a[31] || (((register_a | register_b) << 1) == 0));
                        else
                            register_r <= ((register_a == register_b) || (register_a[31] ^ (register_a < register_b)));
                    end
                    else
                        register_r <= ($signed(register_a) <= $signed(register_b));
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMPGTE, SCMPGTE, FCMPGTE : begin
                    if (opcode == CMPGTE)
                        register_r <= (register_a >= register_b);
                    else if (opcode == FCMPGTE) 
                    begin
                        if (register_a[31] != register_b[31])
                            register_r <= !(register_a[31] && (((register_a | register_b) << 1) != 0));
                        else
                            register_r <= !((register_a != register_b) && (register_a[31] ^ (register_a < register_b)));
                    end
                    else
                        register_r <= ($signed(register_a) >= $signed(register_b));
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMPE, SCMPE, FCMPE : begin
                    if (opcode == CMPE)
                        register_r <= (register_a == register_b);
                    else if (opcode == FCMPE)
                        register_r <= ((register_a == register_b) || (((register_a | register_b) << 1) == 0));
                    else
                        register_r <= ($signed(register_a) == $signed(register_b));
                        
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMPNE, SCMPNE, FCMPNE : begin
                    if (opcode == CMPNE) 
                        register_r <= (register_a != register_b);
                    else if (opcode == FCMPNE)
                        register_r <= !((register_a == register_b) || (((register_a | register_b) << 1) == 0));
                    else
                        register_r <= ($signed(register_a) != $signed(register_b));
                        
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                FLTOINT : begin
                    is_f_to_i <= 1;
                    is_f_to_i_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                INTTOFL : begin
                    is_i_to_f <= 1;
                    is_i_to_f_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FINC : begin
                    register_b <= 32'h3f800000;
                    
                    is_f_adding <= 1;
                    is_f_adding_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FDEC : begin
                    register_b <= 32'hbf800000;
                    
                    is_f_adding <= 1;
                    is_f_adding_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                FSUB : begin
                    register_b[31] <= ~register_b[31];
                    is_f_adding <= 1;
                    is_f_adding_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FADD : begin
                    is_f_adding <= 1;
                    is_f_adding_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FMULT : begin
                    is_f_multing <= 1;
                    is_f_multing_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                FDIV : begin
                    is_f_diving <= 1;
                    is_f_diving_read <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                QADD : begin
                    register_r <= arg0 + arg1;
                    register_z <= (arg0 + arg1 == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                QSUB : begin
                    register_r <= arg0 - arg1;
                    register_z <= (arg0 - arg1 == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                QLADD : begin
                    register_r <= memory[arg0] + arg1;
                    register_z <= (memory[arg0] + arg1 == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end  
                QLSUB : begin
                    register_r <= memory[arg0] - arg1;
                    register_z <= (memory[arg0] - arg1 == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end   
                GETAVB : begin
                    register_a <= memory[arg0];
                    register_b <= arg1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end   
                LAND : begin
                    register_r <= (register_a != 0) && (register_b != 0);
                    register_z <= (((register_a != 0) && (register_b != 0)) == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                LOR : begin
                    register_r <= (register_a != 0) || (register_b != 0);
                    register_z <= (((register_a != 0) || (register_b != 0)) == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                ADD : begin
                    register_r <= register_a + register_b;
                    register_z <= (register_a + register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                SUB : begin
                    register_r <= register_a - register_b;
                    register_z <= (register_a - register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                MULT : begin
                    register_r <= $unsigned(register_a) * $unsigned(register_b);
                    register_z <= (register_a * register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                DIV : begin
                    cycle <= 5'd31;  
                    register_r <= register_a;  
                    denom <= register_b;  
                    work <= 32'b0;  
                    is_dividing <= 1;  
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SDIV : begin
                    cycle <= 5'd31;  
                    work <= 32'b0;  
                    is_dividing <= 1;  
                    
                    division_sign_bit <= (register_a[31] && !register_b[31]) || (!register_a[31] && register_b[31]);
                    
                    // If our register A is negative, convert to unsigned.
                    if (register_a[31]) begin
                        register_r <= -register_a; 
                    end 
                    else begin
                        register_r <= register_a; 
                    end
                    
                    // If our register B is negative, convert to unsigned.
                    if (register_b[31]) begin
                        denom <= -register_b; 
                    end 
                    else begin
                        denom <= register_b; 
                    end
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                REM : begin
                    cycle <= 5'd31;  
                    register_r <= register_a;  
                    denom <= register_b;  
                    work <= 32'b0;  
                    is_dividing <= 2;  
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SREM : begin
                    cycle <= 5'd31;  
                    work <= 32'b0;  
                    is_dividing <= 2;  
                    
                    division_sign_bit <= register_a[31];
                    
                    if (register_a[31]) begin
                        register_r <= -register_a; 
                    end 
                    else begin
                        register_r <= register_a; 
                    end
                    
                    if (register_b[31]) begin
                        denom <= -register_b; 
                    end 
                    else begin
                        denom <= register_b; 
                    end
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SADD : begin
                    register_r <= $signed(register_a) + $signed(register_b);
                    register_z <= ($signed(register_a) + $signed(register_b) == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SSUB : begin
                    register_r <= $signed(register_a) - $signed(register_b);
                    register_z <= ($signed(register_a) - $signed(register_b) == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SMULT : begin
                    register_r <= $signed(register_a) * $signed(register_b);
                    register_z <= ($signed(register_a) * $signed(register_b) == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                JMP : begin
                    position <= arg0;
                    current_instruction <= memory[arg0];
                end
                SETLED : begin
                    led[7:0] <= register_a;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                INC : begin
                    register_a <= register_a + 1;
                    register_r <= register_a + 1;
                    register_z <= (register_a + 1) == 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SINC : begin
                    register_a <= $signed(register_a) + $signed(1);
                    register_r <= $signed(register_a) + $signed(1);
                    register_z <= ($signed(register_a) + $signed(1)) == 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                DEC : begin
                    register_a <= register_a - 1;
                    register_r <= register_a - 1;
                    register_z <= (register_a - 1) == 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SDEC : begin
                    register_a <= $signed(register_a) - $signed(1);
                    register_r <= $signed(register_a) - $signed(1);
                    register_z <= ($signed(register_a) - $signed(1)) == 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                JA : begin
                    if (register_a != 0) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                JNA : begin
                    if (register_a == 0) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                JZ : begin
                    if (register_z) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                MOV : begin
                    move_addr <= arg1;
                    move_value <= memory[
                        arg0
                    ];
                    is_writing <= 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                MOVOUT : begin
                    move_addr <= arg0;
                    move_value <= memory[
                        register_r
                    ];
                    is_writing <= 1;

                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                MOVIN : begin
                    move_addr <= register_r;
                    move_value <= memory[
                        arg0
                    ];
                    is_writing <= 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CMP : begin
                    register_z <= (register_a == register_b);
                    register_greater_than <= (register_a > register_b);
                    register_less_than <= (register_a < register_b);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                CALL : begin
                    stack_position <= stack_position + 1;
                    call_stack[stack_position + 1] <= position;

                    position <= arg0;
                    current_instruction <= memory[arg0];
                end
                RCALL : begin
                    stack_position <= stack_position + 1;
                    call_stack[stack_position + 1] <= position;
                    
                    position <= memory[arg0];
                    current_instruction <= memory[memory[arg0]];
                end
                RTN : begin
                    position <= call_stack[stack_position] + 1;
                    current_instruction <= memory[call_stack[stack_position] + 1];

                    stack_position <= stack_position - 1;                    
                end
                JNZ : begin
                    if (!register_z) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                JLT : begin
                    if (register_less_than) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end               
                end
                JLTE : begin
                    if (!register_greater_than) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end                         
                end
                JGT : begin
                    if (register_greater_than)begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                JGTE : begin
                    if (!register_less_than) begin
                        position <= arg0;
                        current_instruction <= memory[arg0];
                    end
                    else begin
                        position <= position + 1;
                        current_instruction <= memory[position + 1];
                    end
                end
                SWAP : begin
                    register_a <= register_b;
                    register_b <= register_a;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SAVEA : begin
                    memory[arg0] <= register_a;
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SAVEB : begin
                    memory[arg0] <= register_b;
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                NEG : begin
                    register_r <= (register_a == 0 ? 1 : 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end 
                NOP : begin
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                RAND : begin
                    is_rnging <= 1;
                    register_r <= 0;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SAVETO : begin
                    // Save by pushing.
                    if (arg0 == 12'd0) begin
                        stack_memory[stack_memory_position] <= register_r;
                        stack_memory_position <= stack_memory_position + 1;
                    end
                    // Save to register A.
                    else if (arg0 == 12'd1) begin
                        register_a <= register_r;
                    end
                    // Save to register B.
                    else if (arg0 == 12'd2) begin
                        register_b <= register_r;
                    end
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                VPUSH : begin
                    stack_memory[stack_memory_position] <= arg0;

                    stack_memory_position <= stack_memory_position + 1;
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                PUSH : begin
                    stack_memory[stack_memory_position] <= memory[
                        arg0
                    ];

                    stack_memory_position <= stack_memory_position + 1;
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                POP : begin
                    memory[
                        arg0
                    ] <= stack_memory[stack_memory_position - 1];
                    
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                STOREPUSH : begin
                    stack_memory[stack_memory_position] <= memory[
                        position + 1
                    ];

                    stack_memory_position <= stack_memory_position + 1;
                    position <= position + 2;
                    current_instruction <= memory[position + 2];
                end
                POPNOP : begin
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                GETPOPA : begin
                    register_a <= stack_memory[stack_memory_position - 1];
                    
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                GETPOPB : begin
                    register_b <= stack_memory[stack_memory_position - 1];
                    
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                GETPOPR : begin
                    register_r <= stack_memory[stack_memory_position - 1];
                    
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                MOVOUTPUSH : begin
                    move_value <= memory[
                        register_r
                    ];
                    is_pushing <= 1;

                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                MOVINPOP : begin
                    memory[
                        stack_memory[stack_memory_position - 1]
                    ] <= register_r;
                    
                    stack_memory_position <= stack_memory_position - 1;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SHIFTL : begin
                    register_r <= register_a << register_b;
                    register_z <= (register_a << register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                SHIFTR : begin
                    register_r <= register_a >> register_b;
                    register_z <= (register_a >> register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                AND : begin
                    register_r <= register_a & register_b;
                    register_z <= (register_a & register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                OR : begin
                    register_r <= register_a | register_b;
                    register_z <= (register_a | register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                XOR : begin
                    register_r <= register_a ^ register_b;
                    register_z <= (register_a ^ register_b == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                NOT : begin
                    register_r <= ~register_a;
                    register_z <= (~register_a == 0);
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
                TICK : begin
                    register_r <= counter;
                    
                    position <= position + 1;
                    current_instruction <= memory[position + 1];
                end
            endcase	
		end
        
        counter <= counter + 1;
    end
end

endmodule